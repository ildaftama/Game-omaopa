"""Model pembagian kiriman 4 produk inti per outlet, dilatih ulang tiap malam.

Metode yang lulus uji 1 Jul-19 Nov 2026 melawan median web: gradient boosting dari penjualan
reguler harian + kalender libur + Ramadan/Lebaran + momentum. Hasilnya hanya dipakai sebagai
PORSI antar outlet; total per produk tetap mengikuti Buat forecast.

Repo ini publik: log TIDAK boleh mencetak angka penjualan atau prediksi outlet. Hasil hanya
ditulis ke .pcs-temp lalu masuk bundle privat Firestore.
"""
import json
import os
import sys
import warnings
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

HORIZON = 3
MIN_OUTLETS = 20
TRAIN_FROM = '2025-03-01'
HOLIDAYS = {
    '2025': ['01-01', '01-27', '01-29', '03-29', '03-31', '04-01', '04-18', '04-20', '05-01', '05-12', '05-29', '06-01', '06-06', '06-27', '08-17', '09-05', '12-25'],
    '2026': ['01-01', '01-16', '02-17', '03-19', '03-21', '03-22', '04-03', '04-05', '05-01', '05-14', '05-27', '05-31', '06-01', '06-16', '08-17', '08-25', '12-25'],
    '2027': ['01-01', '01-05', '02-06', '03-08', '03-10', '03-11', '03-26', '03-28', '05-01', '05-06', '05-17', '05-20', '06-01', '06-06', '08-15', '08-17', '12-25'],
}
JOINT_LEAVE = {
    '2025': ['01-28', '03-28', '04-02', '04-03', '04-04', '04-07', '05-13', '05-30', '06-09', '08-18', '12-26'],
    '2026': ['02-16', '03-18', '03-20', '03-23', '03-24', '05-15', '05-28', '12-24'],
    '2027': ['02-05', '03-09', '03-12', '03-15', '03-25', '05-18', '05-19', '12-24'],
}
# Awal Ramadan 2027 masih perkiraan sampai ada keputusan Menteri Agama; akhirnya mengikuti SKB Idulfitri.
RAMADAN = [(date(2025, 3, 1), date(2025, 3, 31)), (date(2026, 2, 18), date(2026, 3, 21)), (date(2027, 2, 8), date(2027, 3, 10))]
HOL = {date.fromisoformat(f'{y}-{d}') for y, v in HOLIDAYS.items() for d in v}
LEAVE = {date.fromisoformat(f'{y}-{d}') for y, v in JOINT_LEAVE.items() for d in v}
OFF = HOL | LEAVE
COLUMNS = ['oc', 'p', 'wd', 'l7', 'l14', 'l21', 'l28', 'med8', 'std8', 'm7', 'm14', 'm28', 'tr', 'hol', 'cuti', 'nxt', 'prv', 'longw', 'ram', 'posteid', 'prer', 'netmom', 'omom']


def load_demand(sales, orders):
    known = {}
    for row in orders.get('days', []):
        qty = row.get('qty') or []
        fallback = row.get('knownQty') or []
        known[(row['date'], row['id'])] = [(qty[p] if p < len(qty) and qty[p] is not None else (fallback[p] if p < len(fallback) and fallback[p] is not None else 0)) for p in range(4)]
    rows = []
    for row in sales.get('days', []):
        qty = row.get('qty')
        if not row.get('complete') or not isinstance(qty, list) or len(qty) < 4:
            continue
        core = [float(v or 0) for v in qty[:4]]
        if sum(core) <= 0:
            continue  # outlet tutup / belum beroperasi, bukan permintaan nol
        taken = known.get((row['date'], row['id']), [0, 0, 0, 0])
        rows.extend((row['id'], row['date'], p, max(0.0, core[p] - float(taken[p] or 0))) for p in range(4))
    if not rows:
        raise ValueError('data penjualan kosong')
    frame = pd.DataFrame(rows, columns=['o', 'd', 'p', 'D'])
    frame['d'] = pd.to_datetime(frame['d'])
    return frame.drop_duplicates(['o', 'd', 'p'], keep='last')


def calendar_row(ts):
    x = ts.date()
    nxt = next((n for n in range(8) if x + timedelta(days=n) in OFF), 8)
    prv = next((n for n in range(8) if x - timedelta(days=n) in OFF), 8)
    is_off = x in OFF or x.weekday() >= 5
    run = 0
    y = x
    while y in OFF or y.weekday() >= 5:
        run += 1
        y += timedelta(days=1)
    y = x - timedelta(days=1)
    while y in OFF or y.weekday() >= 5:
        run += 1
        y -= timedelta(days=1)
    return {
        'd': ts, 'hol': int(x in HOL), 'cuti': int(x in LEAVE), 'nxt': nxt, 'prv': prv, 'longw': run if is_off else 0,
        'ram': next(((x - a).days for a, b in RAMADAN if a <= x < b), -1),
        'posteid': min(min(((x - b).days for _, b in RAMADAN if x >= b), default=99), 30),
        'prer': min(min(((a - x).days for a, _ in RAMADAN if x < a), default=99), 14),
    }


def build_features(frame, last_day):
    days = pd.date_range(frame.d.min(), last_day + pd.Timedelta(days=HORIZON))
    pivot = frame.pivot_table(index='d', columns=['o', 'p'], values='D', aggfunc='first').reindex(days)
    net_product = pivot.T.groupby(level='p').sum(min_count=8).T
    net_outlet = pivot.T.groupby(level='o').sum(min_count=2).T
    parts = []
    for (o, p) in pivot.columns:
        s = pivot[(o, p)]
        t = pd.DataFrame({'o': o, 'p': p, 'd': days, 'y': s.values})
        for lag in (7, 14, 21, 28):
            t[f'l{lag}'] = s.shift(lag).values
        weekly = np.column_stack([s.shift(7 * w).values for w in range(1, 9)])
        with np.errstate(all='ignore'):
            with warnings.catch_warnings():
                warnings.simplefilter('ignore', RuntimeWarning)
                t['med8'] = np.nanmedian(weekly, axis=1)
                t['std8'] = np.nanstd(weekly, axis=1)
        recent = s.shift(2)
        t['m7'] = recent.rolling(7, min_periods=3).mean().values
        t['m14'] = recent.rolling(14, min_periods=5).mean().values
        t['m28'] = recent.rolling(28, min_periods=10).mean().values
        t['m14p'] = s.shift(16).rolling(14, min_periods=5).mean().values
        t['tr'] = np.clip(t.m14 / t.m14p.replace(0, np.nan), .5, 2)
        net = net_product[p].shift(2)
        t['netmom'] = (net.rolling(7, min_periods=4).mean() / net.rolling(28, min_periods=10).mean().replace(0, np.nan)).values
        out = net_outlet[o].shift(2)
        t['omom'] = (out.rolling(7, min_periods=3).mean() / out.rolling(28, min_periods=10).mean().replace(0, np.nan)).values
        parts.append(t)
    data = pd.concat(parts, ignore_index=True).merge(pd.DataFrame([calendar_row(d) for d in days]), on='d', how='left')
    data['wd'] = data.d.dt.day_of_week
    data['oc'] = data.o.astype('category').cat.codes
    return data


def latest_complete_day(frame):
    counts = frame[frame.p == 0].groupby('d').o.nunique()
    good = counts[counts >= MIN_OUTLETS]
    if good.empty:
        raise ValueError('belum ada hari dengan outlet cukup')
    return good.index.max()


def predict(sales, orders):
    frame = load_demand(sales, orders)
    last_day = latest_complete_day(frame)
    frame = frame[frame.d <= last_day]
    data = build_features(frame, last_day)
    train = data[data.y.notna() & (data.d >= TRAIN_FROM) & (data.d <= last_day)]
    if len(train) < 5000:
        raise ValueError('riwayat latih terlalu sedikit')
    cols = [c for c in COLUMNS if train[c].notna().sum() >= 200 and train[c].nunique(dropna=True) >= 2]
    model = HistGradientBoostingRegressor(max_iter=220, learning_rate=.05, max_leaf_nodes=23, min_samples_leaf=40, l2_regularization=2.0, categorical_features=[cols.index('oc')], random_state=7)
    model.fit(train[cols], np.log1p(train.y))
    recent_from = last_day - pd.Timedelta(days=27)
    active = set(frame[frame.d >= recent_from].groupby('o').d.nunique().loc[lambda v: v >= 7].index)
    target = data[(data.d > last_day) & data.o.isin(active)].copy()
    target['q'] = np.maximum(np.expm1(model.predict(target[cols])), 0)
    out = {}
    for ts, day in target.groupby('d'):
        # Pengaman: hari dengan hasil tidak wajar tidak dikirim, web otomatis memakai median.
        ratio = day.groupby('p').q.sum() / day.groupby('p').med8.sum().replace(0, np.nan)
        if len(ratio) != 4 or not np.isfinite(day.q).all() or not ratio.between(.6, 1.6).all():
            continue
        table = {}
        for o, rows in day.groupby('o'):
            values = rows.sort_values('p').q.tolist()
            if len(values) == 4:
                table[o] = [round(float(v), 2) for v in values]
        if len(table) >= MIN_OUTLETS:
            out[ts.strftime('%Y-%m-%d')] = table
    if not out:
        raise ValueError('tidak ada hari yang lolos pengaman')
    return {
        'schemaVersion': 1, 'method': 'hgb-sold-v1', 'trainedThrough': last_day.strftime('%Y-%m-%d'),
        'generatedAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'products': 4, 'dates': out,
    }


def main(argv):
    sales_path = argv[1] if len(argv) > 1 else 'forecast/pcs-sales.json'
    orders_path = argv[2] if len(argv) > 2 else 'forecast/pcs-orders.json'
    out_path = argv[3] if len(argv) > 3 else '.pcs-temp/forecast-model.json'
    with open(sales_path, encoding='utf-8') as h:
        sales = json.load(h)
    with open(orders_path, encoding='utf-8') as h:
        orders = json.load(h)
    result = predict(sales, orders)
    os.makedirs(os.path.dirname(out_path) or '.', exist_ok=True)
    tmp = out_path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as h:
        json.dump(result, h, separators=(',', ':'))
    os.replace(tmp, out_path)
    print(f"Model pembagian siap: data s/d {result['trainedThrough']}, {len(result['dates'])} hari ke depan.")


if __name__ == '__main__':
    main(sys.argv)
