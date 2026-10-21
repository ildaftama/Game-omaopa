# Quantity/date/outlet rules carried forward from the reviewed order normalizer.

import collections,datetime as dt,re

EPOCH = dt.date(1899, 12, 30)

def norm(s): return re.sub(r'[^a-z0-9]', '', str(s or '').lower())

def value(r, c): return r.get(str(c), {}).get('value')

def serial(v):
    return EPOCH + dt.timedelta(days=int(v)) if isinstance(v, (int,float)) and not isinstance(v,bool) and 40000 < v < 60000 else None

ALIASES = {
 'jakal':'jakal-uii','jakaluii':'jakal-uii','tajem':'tajem','nusaindah':'nusa-indah','umy':'umy','godean':'godean',
 'rajawali':'rajawali','merbabu':'merbabu','magelang':'pemuda-magelang','pemudamagelang':'pemuda-magelang','muntilan':'muntilann','temanggung':'temanggung',
 'makamhaji':'makamhaji','ums':'ums','jebres':'uns','uns':'uns','boyolali':'boyolali','sragen':'sragen','karanganyar':'karanganyar',
 'sukoharjo':'sukoharjo','nusukan':'nusukan','laweyan':'laweyan','unnes':'unnes','undip':'undip','udinus':'udinus','unimus':'unimus',
 'ngaliyan':'ngaliyan','sampangan':'sampangan','tlogosari':'gajah-raya','gajah':'gajah-raya','gajahraya':'gajah-raya','chiffongajah':'gajah-raya',
 'ambarawa':'ambarawa','uksw':'uksw','pleburan':'pleburan','banyumanik':'pleburan','borobudur':'borobudur','masjidriyadh':'borobudur',
 'udimus':'udinus','kaliurang':'jakal-uii','nusin':'nusa-indah','kra':'karanganyar','outletcisfon':'gajah-raya','uii':'jakal-uii','salatiga':'uksw','umes':'ums','unms':'uns'
}

REVIEWED_SPELLINGS={'umyb':'umy','umyy':'umy','gahaj':'gajah-raya','gaahj':'gajah-raya','ambawara':'ambarawa','udinuyus':'udinus','ngalloiyan':'ngaliyan','nusa ndaj':'nusa-indah','tejam':'tajem','magenag':'pemuda-magelang'}

PROVISIONAL = {}

def one_typo(a,b):
    if abs(len(a)-len(b))>1:return False
    if len(a)==len(b):
        wrong=[i for i,(x,y)in enumerate(zip(a,b))if x!=y]
        return len(wrong)==1 or len(wrong)==2 and wrong[1]==wrong[0]+1 and a[wrong[0]]==b[wrong[1]]and a[wrong[1]]==b[wrong[0]]
    short,long=(a,b)if len(a)<len(b)else(b,a)
    return any(long[:i]+long[i+1:]==short for i in range(len(long)))

def outlet(text):
    s=str(text or '').lower()
    revenue=re.search(r'\b(?:penjualan\s+masuk|masuk\s+(?:penjualan|om[sz]et)|om[sz]et)\s+([a-z ]+?)(?=\s+kue\b|\s+di\b|\d|$)',s)
    if revenue:
        key=norm(revenue[1])
        if key in ALIASES:return 'outlet',ALIASES[key],'explicit-revenue-outlet'
    if norm(re.sub(r'\d.*$','',s))in {'parik','pebrik','poabrik'}:return 'factory',None,'reviewed-factory-spelling'
    if re.search(r'\b(?:pabrik|pabril|pabrikl|office)\b',s): return 'factory',None,'explicit-or-reviewed-spelling'
    if re.search(r'luar\s*kota',s) and not any(re.search(r'\b'+re.escape(a)+r'\b',s) for a in ['jakal','tajem']): return 'external',None,'external-delivery'
    tokens=re.findall(r'[a-z]+',s)
    # Check the complete destination, because product notes sometimes precede it.
    found=set()
    for a,k in ALIASES.items():
        for size in [1,2,3]:
            if any(''.join(tokens[i:i+size])==a for i in range(len(tokens)-size+1)): found.add(k)
    if len(found)==1:return 'outlet',next(iter(found)),'explicit-or-confirmed-alias'
    if len(found)>1:return 'unallocated',None,'multiple-outlets'
    for a,k in PROVISIONAL.items():
        if a in tokens:return 'unallocated',k,'alias-needs-confirmation'
    prefix=re.split(r'\b\d{1,2}[.:,]\d{2}\b',s)[0].strip(' *:-')
    if prefix in REVIEWED_SPELLINGS:return 'outlet',REVIEWED_SPELLINGS[prefix],'reviewed-unique-outlet-spelling'
    attached=re.sub(r'\d.*$','',s).strip()
    if attached=='sampangann':return 'outlet','sampangan','reviewed-unique-outlet-spelling'
    compact=norm(prefix)
    if len(compact)>=4:
        candidates={k for a,k in ALIASES.items()if len(a)>=4 and one_typo(compact,a)}
        if len(candidates)==1:return 'outlet',next(iter(candidates)),'unique-one-character-typo'
    return 'unallocated',None,'unmapped-destination'

def date_header(r):
    v=value(r,0)
    d=serial(v)
    if d:return {'row':r['row'],'raw':d,'month':d.month,'day':d.day,'text':None,'orders':[]}
    if isinstance(v,str) and v.strip():
        m=re.fullmatch(r'\s*(\d{1,2})\s*(ap|nei|ferbruari)\s*',v.lower())
        if m:return {'row':r['row'],'raw':None,'month':{'ap':4,'nei':5,'ferbruari':2}[m[2]],'day':int(m[1]),'text':v,'orders':[]}
        return {'row':r['row'],'raw':None,'month':None,'day':None,'text':v,'orders':[]}
    return None

def resolve_date(group,previous_date,next_raw=None):
    if not group['month']:return None,'invalid-header',[]
    raw=group['raw']
    if group.get('row')==13045 and raw==dt.date(2026,12,25):
        return dt.date(2026,1,25),'specific-date-corrected-owner-confirmed',[]
    # The fulfilment-date sequence is primary. Booking dates can themselves have
    # wrong years and must never silently move sales to a different year.
    year=raw.year if raw else previous_date.year if previous_date else None
    if year is None:return None,'year-unavailable',[]
    if previous_date:
        expected_year=previous_date.year+(previous_date.month>=11 and group['month']<=2)
        if raw and (raw-previous_date).days < -300:year=expected_year
        if raw and (raw-previous_date).days>180 and next_raw and abs((next_raw-previous_date).days)<90:
            return None,'month-or-date-out-of-sequence',[]
    try:d=dt.date(year,group['month'],group['day'])
    except ValueError:return None,'invalid-date',[]
    if raw and abs((d-raw).days)>370:return None,'large-year-change',[]
    if raw and d==raw:return d,'source-date',[]
    if raw:return d,'year-corrected-owner-confirmed',[]
    return d,'month-text-normalized',[]

FLAVORS={'keju':'cheese','cheese':'cheese','cis':'cheese','choco':'choco','chocolate':'choco','coklat':'choco','cokelat':'choco','cho':'choco','durian':'durian'}

def mini(q,text):
    if q in (None,'',0):return None
    s=str(q).lower().strip();desc=' '.join(re.findall(r'(?im)^.*mini.*$',str(text or '').lower()))
    parts=re.findall(r'(\d+)\s*(?:box|boks|pack|pac)\s*(mix|cheese|choco(?:late)?|coklat|durian)\b',s)
    if len(parts)>1 and not re.search(r'\b\d+\s*pcs?\b',desc):
        remainder=re.sub(r'\d+\s*(?:box|boks|pack|pac)\s*(?:mix|cheese|choco(?:late)?|coklat|durian)\b','',s)
        if not remainder.strip(' ,;+&'):
            composition=collections.defaultdict(int)
            for n,f in parts:
                if f=='mix':
                    for flavor in ['cheese','choco','durian']:composition[flavor]+=int(n)*3
                else:composition[FLAVORS[f]]+=int(n)*9
            return {'quantity':sum(composition.values()),'composition':dict(composition),'method':'explicit-multiple-pack-composition'}
    pack=re.match(r'^(\d+)\s*(?:box|boks|bok|pack|pak|pac)\b',s)
    if not pack:
        explicit=re.search(r'\b(\d+)\s*(?:box|boks|pack|pac)\b',desc)
        if explicit and (not isinstance(q,(int,float)) or q==int(explicit[1])):pack=explicit
    pcs=re.match(r'^(\d+)\s*pcs?\b',s)
    # Explicit pcs in the item description overrides the default box notation.
    desc_pcs=re.findall(r'\b(\d+)\s*pcs?\b',desc)
    pcs_total=sum(map(int,desc_pcs)) if desc_pcs else None
    bare=re.fullmatch(r'(\d+)\s*(?:mix)?',s)
    if pcs:count=int(pcs[1]);is_pack=False
    elif pcs_total is not None:count=pcs_total;is_pack=False
    elif pack:count=int(pack[1])*9;is_pack=True
    elif bare:count=int(bare[1])*9;is_pack=True
    else:count=None;is_pack=False
    if count is None:return {'quantity':None,'reason':'unit-needs-confirmation','raw':q}
    details=s+' '+desc
    custom=collections.defaultdict(int)
    # Prefer an explicit composition matching the stated pack size.
    for segment in [s,desc]:
        parts=collections.defaultdict(int)
        for n,f in re.findall(r'\b(\d+)\s*(durian|cheese|choco(?:late)?|coklat|cokelat|cho)\b',segment):parts[FLAVORS[f]]+=int(n)
        if sum(parts.values())==count:custom=parts;break
    if custom:return {'quantity':count,'composition':dict(custom),'method':'explicit-composition'}
    full=re.search(r'\b(?:full|semua)\s*(cheese|choco|coklat|durian)\b',details)
    if full:return {'quantity':count,'composition':{FLAVORS[full[1]]:count},'method':'single-flavor'}
    if 'mix' in details and is_pack:return {'quantity':count,'composition':{'cheese':count//3,'choco':count//3,'durian':count//3},'method':'owner-confirmed-standard-mix'}
    return {'quantity':count,'composition':None,'method':'explicit-unit-flavor-unresolved'}

def chiffon(q):
    if q in (None,'',0):return None
    if isinstance(q,(int,float)):return {'total':q,'products':None,'reason':'variant-needs-description'}
    s=str(q).lower().replace('×','x');products=collections.defaultdict(int);unknown=[]
    for n,t in re.findall(r'(\d+)\s*([^\d]+)',s):
        t=t.strip(' ,;+()');extra=bool(re.search(r'\b(?:ex|ext|extra|ekstra|ektra|ekst|exstra|double)\b',t));lite='lite' in t
        if 'butter' in t:key='Cisfon - Butter'
        elif lite and extra:key='Cisfon Lite - Ekstra Keju'
        elif lite and ('keju' in t or 'cheese' in t):key='Cisfon Lite - Keju'
        elif extra:key='Cisfon - Ekstra Keju'
        elif 'keju' in t or 'cheese' in t:key='Cisfon - Keju'
        else:unknown.append({'quantity':int(n),'text':t});continue
        products[key]+=int(n)
    return {'products':dict(products),'unresolved':unknown,'complete':bool(products)and not unknown}
