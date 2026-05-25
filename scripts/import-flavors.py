"""Import authorized supplier flavors and own kits; preserve selling prices, resumable manifest."""
import json, urllib.request, urllib.parse, re
from pathlib import Path
from decimal import Decimal
ROOT=Path(__file__).resolve().parent.parent
MANIFEST=ROOT/'proposals/flavor-import.json'
BASE='http://localhost:3215/api/'
def api(path,method='GET',body=None):
    req=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json'},method=method)
    with urllib.request.urlopen(req,timeout=20) as response: return json.load(response)
def catalog(query):return api('catalog?size=100&search='+urllib.parse.quote(query))['items']
state=json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {'schema_version':1,'products':{},'complete':False}
if state['complete']:
    print('Flavor import already completed; no data or custom order changed.')
    raise SystemExit(0)
original=json.loads((ROOT/'proposals/current-products.json').read_text())['products']
# First variants retain the original product IDs, including references from own kits.
current=api('products'); byid={p['id']:p for p in current}
def persist():MANIFEST.write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n')
def upsert(key,name,price,kind='product',components=None,source=None,reuse=None,units=1,kit=None):
    body={'name':name,'selling_price':price,'kind':kind,'code':source.get('internal_code') if source else None,'barcode':source.get('barcode') if source else None,'components':components or []}
    existing=state['products'].get(key)
    if existing and existing['id'] in byid:
        pid=existing['id']
        # Resuming should not overwrite edits made after a completed import.
        if state['complete']: return pid
    else:
        if reuse:
            assert reuse in byid, 'Original product is missing; review instead of recreating blindly'
            pid=reuse
            assert byid[pid]['kind']==kind
            # The user may have edited selling prices; carry the latest value forward.
            body['selling_price']=byid[pid]['selling_price']
            api('products/'+str(pid),'PUT',body)
        else:
            # Recover an already created row if the process stopped before writing its manifest.
            matches=[p for p in api('products') if p['name']==name and p['kind']==kind]
            assert len(matches)<=1, 'Duplicate names require review'
            pid=matches[0]['id'] if matches else api('products','POST',body)['id']
        state['products'][key]={'id':pid,'name':name,'kind':kind,'selling_price':body['selling_price'],'supplier_external_id':source['external_id'] if source else None,'individual_units':units,'kit_external_id':kit['external_id'] if kit else None}
        persist()
    if source:
        api('products/'+str(pid)+'/links','PUT',{'provider_id':source['provider_id'],'individual_item_id':source['id'],'kit_item_id':kit['id'] if kit else None,'individual_units':units,'matches_confirmed':bool(kit),'pack_confirmed':bool(source['is_pack'])})
    return pid

groups=[]
prot=catalog('Platinum Whey Protein')
prot3=[p for p in prot if '3 kg' in p['name'].lower() and p['brand']=='STAR NUTRITION']
prot2=[p for p in catalog('Premium Whey DOYPACK') if re.search(r'2\s*lb\b',p['name'],re.I) and 'doypack' in p['name'].lower() and p['brand']=='STAR NUTRITION']
creat=catalog('CREATINA 300 DOYPACK')
creatUnits=[p for p in creat if p['brand']=='STAR NUTRITION' and not p['is_pack']]
kitMap={'823150':'949685','971124':'1042007','1018057':'1042009','1018058':'1042010'}
kitsByExternal={p['external_id']:p for p in creat if p['is_pack']}
creatUnits.sort(key=lambda p:(p['external_id']!='823150',p['name']))
boxes=catalog('Enargy Bar')
ena=[p for p in catalog('True Made') if re.search(r'1\s*kg',p['name'],re.I) and p['brand']=='ENA LAB' and not p['is_pack']]
mass=[p for p in catalog('Mutantmass 5') if re.search(r'mutantmass 5\s*kg',p['name'],re.I) and p['brand']=='STAR NUTRITION']
assert [len(prot3),len(prot2),len(creatUnits),len(boxes),len(ena),len(mass)]==[5,7,4,4,5,5], 'Unexpected flavor list: review before applying'

def flavor(p,kind):
    n=p['name']
    if kind=='p3':return re.split(r'3\s*Kg\s*',n,flags=re.I)[1].split(' - ')[0].strip()
    if kind=='p2':return re.split(r'Premium Whey Protein\s*',n,flags=re.I)[1].split('2lb')[0].strip()
    if kind=='creatine':return re.split(r'300gr\s*',n,flags=re.I)[1].split('DOYPACK')[0].strip()
    if kind=='bar':return re.split(r'Enargy Bar\s*',n,flags=re.I)[1].split('(16x')[0].strip()
    if kind=='ena':return re.split(r'1\s*Kg\s*',n,flags=re.I)[1].split(' - ')[0].strip()
    return re.split(r'5\s*Kg\s*',n,flags=re.I)[1].strip()

def create_group(items,base,price,kind,originalId,units=1):
    ids=[]
    for i,item in enumerate(items):
        f=flavor(item,kind)
        matchKit=kitsByExternal[kitMap[item['external_id']]] if kind=='creatine' else None
        pid=upsert(f'{kind}:{units}:{item["external_id"]}',base+' · '+f,price,source=item,reuse=originalId if i==0 else None,units=units,kit=matchKit)
        ids.append((pid,f))
    groups.append([pid for pid,_ in ids]);return ids

p3=create_group(prot3,original[0]['name'],byid[37]['selling_price'],'p3',37)
p2=create_group(prot2,'STAR Premium Whey Protein DOYPACK 2 LB',byid[38]['selling_price'],'p2',38)
c=create_group(creatUnits,original[2]['name'],byid[39]['selling_price'],'creatine',39)
# Complete boxes and individual bars have the same supplier offer, different unit divisors.
box=create_group(boxes,original[7]['name'],byid[44]['selling_price'],'bar',44,1)
bar=create_group(boxes,original[8]['name'],byid[45]['selling_price'],'bar',45,16)
e=create_group(ena,'ENA Whey Protein True Made 1 KG',byid[46]['selling_price'],'ena',46)
m=create_group(mass,original[10]['name'],byid[47]['selling_price'],'mass',47)
kitCreat=[];kitProt=[];kitMixed=[]
for i,(pid,f) in enumerate(c):
    kitCreat.append(upsert(f'own-creatine:{pid}',original[3]['name']+' · '+f,byid[40]['selling_price'],'kit',[{'product_id':pid,'quantity':2}],reuse=40 if i==0 else None))
for i,(pid,f) in enumerate(p2):
    kitProt.append(upsert(f'own-protein:{pid}','PROMO STAR Premium Whey Protein DOYPACK 2 LB x 2 · '+f,byid[41]['selling_price'],'kit',[{'product_id':pid,'quantity':2}],reuse=41 if i==0 else None))
for i,(protein,pf) in enumerate(p2):
    for j,(creatine,cf) in enumerate(c):
        kitMixed.append(upsert(f'own-mixed:{protein}:{creatine}',original[5]['name']+' · '+pf+' + '+cf,byid[42]['selling_price'],'kit',[{'product_id':protein,'quantity':1},{'product_id':creatine,'quantity':1}],reuse=42 if i==j==0 else None))
# Keep the user's original table order, with flavors next to their presentation.
ordered=[pid for pid,_ in p3]+[pid for pid,_ in p2]+[pid for pid,_ in c]+kitCreat+kitProt+kitMixed+[43]+[pid for pid,_ in box]+[pid for pid,_ in bar]+[pid for pid,_ in e]+[pid for pid,_ in m]
products=api('products'); extras=[p['id'] for p in products if p['id'] not in ordered]
api('products/order','PUT',{'ids':ordered+extras})
products=api('products'); lookup={p['id']:p for p in products}
for rec in state['products'].values():
    p=lookup[rec['id']]
    assert p['selected'] and p['selected']['costArs'] is not None
    assert Decimal(p['selling_price'])==Decimal(rec['selling_price'])
    if rec['supplier_external_id']:
        assert p['selected']['individual']['external_id']==rec['supplier_external_id']
        assert p['selected']['individual_units']==rec['individual_units']
        if rec['kit_external_id']:assert p['selected']['kit']['external_id']==rec['kit_external_id']
    else:assert p['kind']=='kit' and p['components']
assert len(ordered)==74 and len(set(ordered))==74
state['complete']=True;state['ordered_ids']=ordered;state['counts']={'individual_products':35,'own_kits':39,'total':74};persist()
print('Verified: 74 products; 35 individual presentations/flavors, 39 own kits; all prices calculated.')
print('Negative gross profit:',sum(Decimal(p['selected']['profit'])<0 for p in products if p['id'] in ordered))
