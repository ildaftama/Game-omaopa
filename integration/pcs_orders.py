"""Read the owner's PESANAN workbook; publish aggregate cake counts only."""
import collections,datetime as dt,hashlib,io,json,posixpath,re,sys,urllib.request,zipfile
from pathlib import Path
import xml.etree.ElementTree as ET
from pcs_order_rules import date_header,resolve_date,outlet,mini,chiffon

PRODUCTS=['Ogura Cheese','Ogura Chocolate','Malmil Cheese','Malmil Chocolate','Mini Ogura - Cheese','Mini Ogura - Choco','Mini Ogura - Durian','Cisfon - Keju','Cisfon - Ekstra Keju','Cisfon - Butter','Cisfon Lite - Ekstra Keju','Cisfon Lite - Keju']
NS={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def read_workbook(data,tab='PESANAN',start=5577):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        shared=[]
        if 'xl/sharedStrings.xml' in z.namelist():
            for _,e in ET.iterparse(z.open('xl/sharedStrings.xml'),events=['end']):
                if e.tag.endswith('}si'):shared.append(''.join(t.text or '' for t in e.findall('.//s:t',NS)));e.clear()
        workbook=ET.fromstring(z.read('xl/workbook.xml'));s=next((s for s in workbook.findall('s:sheets/s:sheet',NS)if s.attrib['name']==tab),None)
        if s is None:raise ValueError('Tab PESANAN tidak ditemukan.')
        rel=s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
        target=next(r.attrib['Target']for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))if r.attrib['Id']==rel)
        path=target.lstrip('/')if target.startswith('/')else posixpath.normpath('xl/'+target)
        rows=[]
        for _,e in ET.iterparse(z.open(path),events=['end']):
            if not e.tag.endswith('}row'):continue
            rn=int(e.attrib['r'])
            if rn<start:e.clear();continue
            row={'row':rn}
            for c in e.findall('s:c',NS):
                letters=re.match(r'[A-Z]+',c.attrib['r'])[0];col=0
                for a in letters:col=col*26+ord(a)-64
                col-=1
                # Do not read name or contact columns B/C.
                if col not in [0,3,4,5,6,7,8,9,10,11,13,14]:continue
                v=c.find('s:v',NS);v=v.text if v is not None else None;typ=c.attrib.get('t')
                if typ=='s':v=shared[int(v)]if v is not None else None
                elif typ=='inlineStr':v=''.join(t.text or ''for t in c.findall('.//s:t',NS))
                elif typ=='e':v=None
                elif v is not None:
                    try:v=float(v);v=int(v)if v.is_integer()else v
                    except ValueError:pass
                if v is not None:row[str(col)]={'value':v}
            if len(row)>1:rows.append(row)
            e.clear()
        if not rows:raise ValueError('Sheet tidak memiliki baris pesanan.')
        return rows

def val(r,col):return r.get(str(col),{}).get('value')
def fingerprint(r):
    # A changed receipt must not inherit an old manual exception by row number.
    values=[val(r,c)for c in [3,10,11,13]]
    return hashlib.sha256(json.dumps(values,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
def integer(v):
    if isinstance(v,(int,float))and not isinstance(v,bool)and v>=0 and v==int(v):return int(v)
    if isinstance(v,str)and re.fullmatch(r'\s*\d+\s*(?:pcs?)?\s*',v,re.I):return int(re.search(r'\d+',v)[0])
    return None

def text_core(text,family,flavor):
    found=[];mentioned=False
    for line in text.lower().splitlines():
        if family not in line or 'mini' in line:continue
        if re.match(r'\s*[*_ -]*(topping|harga|catatan|note|keterangan|total)\b',line):continue
        if not re.search(flavor,line):
            if not re.search(r'cheese|keju|\bcis\b|choco(?:late)?|coklat|cokelat|\bcho\b',line):return None
            continue
        if re.search(r'\b(free|gratis)\b',line):continue
        mentioned=True
        # Explicit quantity only, never price / average price.
        clean=re.sub(r'^\s*(?:\d+[.)]\s*|[-*•_]+\s*)','',line)
        patterns=[r'^\s*(\d{1,3})\s*(?:pcs?\s+)?'+family,r'\b'+family+r'.*?\(\s*(\d{1,3})\s*(?:pcs?)?\s*\)',r'\b'+family+r'.*?[:=]\s*(\d{1,3})\s*pcs?\b',r'\b'+family+r'.*?\b(\d{1,3})\s*pcs?\b']
        candidates=[]
        for p in patterns:
            m=re.search(p,clean)
            if m:candidates.append(int(m[1]))
        if candidates and len(set(candidates))==1:found.append(candidates[0])
        else:return None
    return sum(found)if found else None if mentioned else 0

def quantities(r):
    q=[val(r,c)for c in range(4,10)];text=str(val(r,3)or'');result=[]
    for i in range(4):
        n=integer(q[i]);family='ogura'if i<2 else'malmil';flavor=r'cheese|keju|\bcis\b'if i%2==0 else r'choco(?:late)?|coklat|cokelat|\bcho\b'
        result.append(n if n is not None else text_core(text,family,flavor))
    m=mini(q[4],text)
    if not m and 'mini' in text.lower():
        lines='\n'.join(l for l in text.splitlines()if 'mini' in l.lower())
        explicit=re.search(r'(\d+)\s*(box|boks|pack|pac|pcs?)\b',lines,re.I)
        if explicit:m=mini(explicit[0],lines)
    result.extend([m['composition'].get(k,0)for k in ['cheese','choco','durian']]if m and m.get('composition')and sum(m['composition'].values())==m['quantity']else[None]*3 if m or 'mini'in text.lower()else[0]*3)
    c=chiffon(q[5])
    result.extend([c['products'].get(k,0)for k in PRODUCTS[7:]]if c and c.get('complete')else[None]*5 if c or re.search(r'chiff?on|cis[fs]on',text,re.I)else[0]*5)
    return result

def aggregate(rows,reviews=None):
    reviews=reviews or {};groups=[];current=None
    for r in rows:
        header=date_header(r)
        if header:groups.append(header);current=header
        if str(val(r,3)or'').strip()and current:current['orders'].append(r)
    dates=set();blocked=set();days={};previous=None;excluded=0;unresolved=0
    for i,g in enumerate(groups):
        following=next((x['raw']for x in groups[i+1:i+4]if x['raw']),None)
        date,method,_=resolve_date(g,previous,following)
        if not date:unresolved+=len(g['orders']);continue
        previous=date;date=date.isoformat();dates.add(date)
        for r in g['orders']:
            review=reviews.get(fingerprint(r),{});text=str(val(r,3)or'');status=str(val(r,13)or'')
            non_sale=review.get('nonSale')or(bool(re.search(r'adjust.{0,25}admin|admin.{0,25}adjust|kue.{0,15}adjust|kue\s+kompensasi|adjust\s+pabrik|dibayar\s+marketing',text+' '+status,re.I))and integer(val(r,11))is None and not re.search(r'\b(lunas|dp)\b',status,re.I))
            if non_sale:excluded+=1;continue
            channel,oid,_=outlet(val(r,10))
            if review.get('outletId'):channel='outlet';oid=review['outletId']
            if channel in ['factory','external']:excluded+=1;continue
            if channel!='outlet':blocked.add(date);unresolved+=1;continue
            key=(date,oid);d=days.setdefault(key,{'date':date,'id':oid,'qty':[0]*12,'knownQty':[0]*12,'frequency':[0]*12,'orders':0,'unresolved':0});d['orders']+=1
            q=quantities(r)
            if re.search(r'\b(refund|batal|cancel)\b',status,re.I)and not review.get('refundReconciled'):q=[None]*12
            if any(v is None for v in q):d['unresolved']+=1
            for p,v in enumerate(q):
                if v is None:d['qty'][p]=None
                elif d['qty'][p]is not None:d['qty'][p]+=v
                if v is not None:d['knownQty'][p]+=v
                if v is not None and v>0:d['frequency'][p]+=1
    if unresolved>max(100,len(rows)//5):raise ValueError('Struktur atau tanggal pesanan berubah; hasil lama dipertahankan.')
    return {'schemaVersion':1,'updatedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'products':PRODUCTS,'coveredDates':sorted(dates),'blockedDates':sorted(blocked),'days':sorted(days.values(),key=lambda r:(r['date'],r['id'])),'excludedRecords':excluded,'unresolvedRecords':unresolved}

def fetch_source(config):
    s=next(s for s in config['sources']if s['key']=='orders');m=re.fullmatch(r'https://docs\.google\.com/spreadsheets/d/([A-Za-z0-9_-]+)(?:/.*)?',s['url'])
    if not m or s.get('tab')!='PESANAN':raise ValueError('Sumber pesanan harus Google Sheets dengan tab PESANAN.')
    request=urllib.request.Request('https://docs.google.com/spreadsheets/d/'+m[1]+'/export?format=xlsx',headers={'User-Agent':'OmaOpa-PCS/1.0'})
    with urllib.request.urlopen(request,timeout=90)as response:data=response.read(45*1024*1024+1)
    if len(data)>45*1024*1024 or not data.startswith(b'PK'):raise ValueError('Sheet belum dapat dibaca.')
    return read_workbook(data,s['tab'],int(s.get('startRow',5577)))

def main():
    config_path=Path('.pcs-temp/data-sources.json')
    if not config_path.exists():config_path=Path('forecast/data-sources.json')
    config=json.loads(config_path.read_text(encoding='utf-8'))
    reviews=json.loads(Path('integration/pcs-order-reviews.json').read_text())
    rows=read_workbook(Path(sys.argv[1]).read_bytes())if len(sys.argv)>1 else fetch_source(config)
    result=aggregate(rows,reviews)
    if len(result['coveredDates'])<30:raise ValueError('Tanggal pesanan belum lengkap; data lama dipertahankan.')
    Path('forecast/pcs-orders.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print('Rekap pesanan selesai. Hanya jumlah kue per outlet dan tanggal yang disimpan.')
if __name__=='__main__':
    try:main()
    except Exception:
        print('Rekap pesanan gagal diperbarui. Data lama dipertahankan; detail pelanggan tidak dicetak.',file=sys.stderr);sys.exit(1)
