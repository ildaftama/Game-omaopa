"""Written quantities only: never divide revenue or prices to obtain cake counts."""
import re
from functools import lru_cache

FAMILY=r'\b(?:malmil|ogura|mini|chiffon)\b'
FLAVOR=r'(cheese|choco|durian)'

@lru_cache(maxsize=8192)
def clean(text):
 s=str(text or '').lower().replace('\u2060','').replace('\u200b','').replace('\xa0',' ')
 s=re.sub(r'\bminimix\b','mini mix',s)
 s=re.sub(r'\boghura\b','ogura',s)
 s=re.sub(r'\b(?:choclate|chocoate)\b','choco',s)
 for pattern,repl in [(r'\bmmchis\b','malmil cheese'),(r'\bmmcho\b','malmil choco'),(r'\bochis\b','ogura cheese'),(r'\bocho\b','ogura choco'),(r'\b(?:chiff?on|chiff?fon|chiff?en|cisf[fo]n|cisffon|chisfon|chesfon|chesfoon|cisofn|cisfom|cifon|ciffon|chifon|chifron)\b','chiffon'),(r'\b(?:chesee|chees|chesse|chese|cheeze|cheze|chess|keju|ches|cis)\b','cheese'),(r'\b(?:chocholate|chocho|chocolate|cocho|choklat|cokelat|coklat|cok|cho|coco|co)\b','choco'),(r'\b(?:dur|duren)\b','durian'),(r'\b(?:ekstra|ektra|exstra|ekst|extra|extre|extrq|double|ext|ex|ec)\b','extra'),(r'\b(?:klasik|klasik|klasik|klas|classic|clsc|kls|ks|biasa|reguler|regular|reg)\b','classic')]:s=re.sub(pattern,repl,s)
 s=re.sub(r'\b(cheese|choco)\s+(malmil|ogura)\b',r'\2 \1',s)
 return s

def item_lines(text,family=None):
 for raw in clean(text).splitlines():
  line=re.sub(r'^\s*(?:\d+[.)]\s*|[-*•_~]+\s*)','',raw).strip()
  if not re.search(FAMILY,line):continue
  if family and not re.search(r'\b'+family+r'\b',line):continue
  if re.search(r'\b(?:plastik|minta|ucapan|tulisan|dipotong|potong|catatan|catetan|keterangan|nota|gambar|contoh|packing|kemasan|kotak|dus kosong)\b',line):continue
  if re.match(r'(?:pe|note|harga|topping|toping|total|sub\s*total|ongkir|free|gratis|bonus)\b',line):continue
  if re.search(r'\b(?:malmil|ogura|chiffon)\s+produksi\b',line):continue
  line=re.sub(r'\(\s*produksi[^)]*\)','',line)
  yield line

@lru_cache(maxsize=8192)
def count(line,family):
 """Read the printed integer, excluding money, dimensions and list numbers."""
 s=clean(line);candidates=[]
 # Price times written count is still an explicit count, not monetary division.
 for m in re.finditer(r'@?\s*(?:rp\.?\s*)?\d{1,3}(?:[.,]\d{3,})+(?:[.,]\d{1,2})?\s*[x×]\s*(\d{1,3})(?![\d.,])',s):candidates.append(int(m[1]))
 # Remove only price/measurement tokens, preserving counts around them.
 s=re.sub(r'(?:rp\.?\s*)?\d{1,3}(?:[.,]\d{3,})+(?:[.,]\d{1,2})?|\brp\.?\s*\d+|\b\d{4,}\b',' ',s)
 s=re.sub(r'\b\d+\s*cm\b|[½¼¾]|\b[12]/[24]\b',' ',s)
 s=re.sub(r'\(\s*\)','',s)
 s=re.sub(r'^\s*(?:\d+[.)]\s*|[-*•_~]+\s*)','',s).strip()
 lead=re.search(r'(?<![\d.,])(\d{1,3})\s*(?:[x×]|pcs?|box|boks|dus|pack|pac)?\s*\b'+family+r'\b',s)
 if lead:candidates.append(int(lead[1]))
 for m in re.finditer(r'\(\s*(\d{1,3})\s*(?:pcs?|box|boks|pack|pac)?\s*\)',s):candidates.append(int(m[1]))
 for m in re.finditer(r'(?<![\d.,])(\d{1,3})\s*(?:pcs?|item|buah|biji|box|boks|bok|dus|pack|pak|pac)\b',s):candidates.append(int(m[1]))
 # n x unit price, n @ price, or a trailing written number before totals.
 for m in re.finditer(r'(?<![\d.,])(\d{1,3})\s*[x×@]',s):candidates.append(int(m[1]))
 tail=re.split(r'\b'+family+r'\b',s,maxsplit=1)[-1]
 tail=re.split(r'[:=]',tail,maxsplit=1)[0]
 last=re.search(r'(?<![\d.,])(\d{1,3})(?![\d.,])\s*[*_~ ]*$',tail)
 if last:candidates.append(int(last[1]))
 if not candidates:
  colon=re.search(r'[:=]\s*(\d{1,3})\s*(?:pcs?|item|buah|biji|box|boks|pack|pak|pac)?\s*$',s)
  if colon:candidates.append(int(colon[1]))
 if not candidates:
  integers=re.findall(r'(?<![\d.,])(\d{1,3})(?![\d.,])',s)
  if len(integers)==1:candidates.append(int(integers[0]))
 if len(set(candidates))==1:return next(iter(set(candidates)))
 if len(set(candidates))>1:
  # Validate competing WRITTEN counts against an explicit unit price/subtotal.
  # Never invent a count by dividing money by a price.
  money=r'(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3,})+|\d{4,})'
  prices=re.findall(r'@\s*'+money,clean(line))
  if not prices:prices=re.findall(r'[x×]\s*'+money,clean(line))
  totals=re.findall(r'[:=]\s*'+money,clean(line))
  integer_money=lambda x:int(re.sub(r'[^\d]','',x))
  if prices and totals:
   matches={q for q in candidates if q*integer_money(prices[0])==integer_money(totals[-1])}
   if len(matches)==1:return next(iter(matches))
 if not candidates and not re.search(r'\d',s):return 1 # Owner: named cake without quantity means one.
 return None

@lru_cache(maxsize=8192)
def core(text,family):
 result=[0,0];source=clean(text)
 if re.search(r'semua\s+'+family,source):
  source='\n'.join(family+' '+l if re.match(r'\s*[-*•_ ]*(?:cheese|choco)\b',l)else l for l in source.splitlines()if not re.search(r'semua\s+'+family,l))
 lines=list(item_lines(source,family));context=None
 if len(lines)>1 and re.match(r'kue\s+(?:yg|yang)\s+di?pesan',lines[0]):
  match=re.search(family+r'\s+(cheese|choco)\b',lines[0])
  if match and not re.search(r'\d',lines[0]):context=match[1];lines=lines[1:]
 for line in lines:
  if 'mini' in line:continue
  # A base flavor precedes topping; topping never changes the cake base.
  base=re.split(r'\b(?:topping|toping|top|full|half|mix)\b',line)[0]
  base=re.sub(r'\b(?:original|ori|polos|cake|base|yg|yang|rasa)\b',' ',base)
  match=re.search(r'\b'+family+r'\s+(cheese|choco)\b',base)
  if not match:
   # Explicit "cake base yg coklat" still names the chocolate base.
   match=re.search(r'\b'+family+r'.*?\b(cheese|choco)\b',base)
  if not match and context:match=re.search(r'(cheese|choco)',context)
  q=count(line,family)
  if match:
   p=0 if match[1]=='cheese'else 1
   if q is None:result[p]=None
   elif result[p]is not None:result[p]+=q
  else:result=[None,None]
 return result

def chiffon_cell(cell):
 if cell in (None,'',0):return None
 if isinstance(cell,(int,float)):return None
 s=clean(cell);result=[0]*5;matches=list(re.finditer(r'(\d+)\s*([^\d]+)',s))
 if not matches:return None
 for m in matches:
  n=int(m[1]);t=m[2]
  if 'kurma' in t:continue
  lite='lite' in t;extra='extra' in t
  p=3 if lite and extra else 4 if lite else 2 if 'butter' in t else 1 if extra else 0 if re.search(r'classic|cheese',t)else None
  if p is None:return None
  result[p]+=n
 return result

def chiffon_text(text,source_count=None):
 result=[0]*5;lines=list(item_lines(text,'chiffon'))
 if not lines:return None
 for line in lines:
  if 'kurma' in line:continue
  lite='lite' in line;extra='extra' in line
  p=3 if lite and extra else 4 if lite else 1 if extra else 2 if 'butter' in line else 0 if 'cheese' in line or 'classic' in line else None
  q=count(line,'chiffon')
  if source_count is not None and len(lines)==1 and q==1:
   stripped=re.sub(r'(?:rp\.?\s*)?\d{1,3}(?:[.,]\d{3})+|\b\d{4,}\b','',line)
   if not re.search(r'\d',stripped):q=source_count
  if p is None or q is None:
   for i in ([3,4]if lite else[0,1,2]):result[i]=None
  elif result[p]is not None:result[p]+=q
 return result

def mini_cell(cell,text):
 s=re.sub(r'\b(?:mini|ogura)\b|[()]',' ',clean(cell));s=re.sub(r'\s+',' ',s).strip();lines=list(item_lines(text,'mini'));desc='\n'.join(lines)
 # Each explicit box is 9 PCS. A standard mix box is 3 of each flavor.
 def parts_value(parts,multiplier=1):
  result=[0,0,0]
  for n,flavor in parts:
   if flavor=='mix':result=[v+int(n)*3 for v in result]
   else:result[['cheese','choco','durian'].index(flavor)]+=int(n)*multiplier
  return result
 flavor_count=r'(\d+)\s*(?:pcs?|pc)?\s*'+FLAVOR+r'\s*(?:pcs?|pc)?\b'
 parts=list(re.finditer(flavor_count,s))
 rem=re.sub(flavor_count,'',s).strip(' .,;+&')
 if parts and not rem:
  pairs=[(m[1],m[2])for m in parts];total=sum(int(m[1])for m in parts)
  explicit_pc=bool(re.search(r'(?<![a-z])pcs?\b',s))
  boxes=[count(l,'mini')for l in lines if re.search(r'\b(?:box|boks|pack|pac|pak)\b',l)]
  note_count=count(lines[0],'mini')if len(lines)==1 else None
  if explicit_pc or len(boxes)==1 and boxes[0]is not None and total==boxes[0]*9 or len(lines)==1 and note_count==total and '('in desc:
   return parts_value(pairs)
 # Explicit pack segments, optionally followed by loose PCS segments.
 pattern=r'(\d+)\s*(?:(box|boks|pack|pac|pak|bok)\s*)?(?:full\s*|ful\s*)?(mix|cheese|choco|durian)\b'
 parts=list(re.finditer(pattern,s));remainder=re.sub(pattern,'',s).strip(' .,;+&()')
 if parts and not remainder and not re.search(r'(?<![a-z])pcs?\b',s):
  # Bare flavor counts can be PCS composition; require a pack/full marker.
  if all(m[2]or m[3]=='mix'or re.search(r'full|ful',m[0])for m in parts):return parts_value([(m[1],m[3])for m in parts],9)
 reverse=re.fullmatch(r'\s*(mix|cheese|choco|durian)\s*(\d+)\s*(?:box|boks|pack|pac|pak)\s*',s)
 if reverse:return parts_value([(reverse[2],reverse[1])],9)
 # Standard box plus extra pieces: units must be explicit for the loose parts.
 box_pattern=r'(\d+)\s*(?:box|boks|pack|pac|pak)\s*(?:full\s*)?(mix|cheese|choco|durian)\b'
 piece_pattern=r'(\d+)\s*pcs?\s*'+FLAVOR+r'\b'
 boxes=list(re.finditer(box_pattern,s));pieces=list(re.finditer(piece_pattern,s))
 if boxes and pieces:
  rest=re.sub(piece_pattern,'',re.sub(box_pattern,'',s)).strip(' .,;+&')
  if not rest:
   a=parts_value([(m[1],m[2])for m in boxes],9);b=parts_value([(m[1],m[2])for m in pieces]);return[x+y for x,y in zip(a,b)]
 # Detailed composition inside a stated pack replaces its standard mix.
 composition=[(m[1],m[2])for m in re.finditer(flavor_count,s)]
 pack_count=re.search(r'(\d+)\s*(?:box|boks|pack|pac|pak)\b',s)
 if composition and pack_count and sum(int(n)for n,_ in composition)==int(pack_count[1])*9:return parts_value(composition)
 if s and re.search(r'\b(?:box|boks|pack|pac|pak)\b',s):return None
 # Read item lines only when each line has a known unit/composition.
 if not lines:return None
 result=[0,0,0];parsed=False
 for line in lines:
  q=count(line,'mini')
  if q is None:return None
  tail=re.split(r'\bmini\b',line,maxsplit=1)[-1]
  flavor_names=set(re.findall(FLAVOR,tail))
  if flavor_names=={'cheese','choco'} and not re.search(r'\bpcs?\b',line):values=[q*4,q*5,0] # Owner-confirmed two-flavor box.
  elif (('mix'in tail and len(flavor_names)in [0,3])or not flavor_names) and not re.search(r'\bpcs?\b',line):values=[q*3]*3 # Owner: unnamed Mini Ogura is standard mix too.
  elif len(flavor_names)==1:
   explicit_pc=bool(re.search(r'\bpcs?\b',line))
   explicit_box=bool(re.search(r'\b(?:box|boks|pack|pac|pak)\b',line))
   # A numeric source-column quantity is owner-confirmed box notation unless PCS is written.
   numeric_column=bool(re.fullmatch(r'\s*\d+\s*',s))
   if not(explicit_pc or explicit_box or numeric_column):return None
   values=parts_value([(q,next(iter(flavor_names)))],1 if explicit_pc else 9)
  else:return None
  result=[a+b for a,b in zip(result,values)];parsed=True
 return result if parsed else None
