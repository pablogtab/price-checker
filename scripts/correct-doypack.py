"""Apply the confirmed Premium DOYPACK correction, preserving existing prices/order."""
import json, urllib.request, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / 'proposals/flavor-import.json'
def api(path, method='GET', body=None):
    req = urllib.request.Request('http://127.0.0.1:3215/api/'+path,
        data=None if body is None else json.dumps(body).encode(),
        headers={'Content-Type':'application/json'}, method=method)
    with urllib.request.urlopen(req, timeout=20) as response: return json.load(response)

state = json.loads(MANIFEST.read_text())
before = api('products')
lookup = {p['id']:p for p in before}
original_order = [p['id'] for p in before]
sources = api('catalog?size=100&search='+urllib.parse.quote('Premium Whey DOYPACK'))['items']
assert len(sources) == 7
assert all('2lb' in s['name'].lower() and 'doypack' in s['name'].lower() and s['brand']=='STAR NUTRITION' and not s['is_pack'] for s in sources)
reuse = {'640343':38, '202303':52, '640341':53, '640345':54, '202305':55}
def save(key, name, price, kind='product', components=None, source=None, pid=None):
    record = state['products'].get(key)
    if record: pid = record['id']
    current = next((p for p in api('products') if p['id']==pid), None) if pid else None
    if not current:
        current = next((p for p in api('products') if p['name']==name), None)
    body = {'name':name,'kind':kind,'selling_price':current['selling_price'] if current else price,
            'code':source.get('internal_code') if source else (current or {}).get('code'),
            'barcode':source.get('barcode') if source else (current or {}).get('barcode'),
            'components':components or [], 'preferred_provider_id':(current or {}).get('preferred_provider_id')}
    result = api('products/'+str(current['id']) if current else 'products', 'PUT' if current else 'POST', body)
    pid = current['id'] if current else result['id']
    if source:
        api(f'products/{pid}/links', 'PUT', {'provider_id':1,'individual_item_id':source['id']})
    # Replace superseded manifest keys referencing the same own product.
    for old in [k for k,v in state['products'].items() if v['id']==pid and k!=key]:
        del state['products'][old]
    state['products'][key] = {'id':pid,'name':name,'kind':kind,'selling_price':body['selling_price'],
        'supplier_external_id':source['external_id'] if source else None,'individual_units':1,'kit_external_id':None}
    MANIFEST.write_text(json.dumps(state, ensure_ascii=False, indent=2)+'\n')
    return pid

proteins = []
for source in sources:
    flavor = source['name'].split('Protein',1)[1].split('2lb',1)[0].strip()
    pid = save('p2:1:'+source['external_id'], 'STAR Premium Whey Protein DOYPACK 2 LB · '+flavor,
               lookup[38]['selling_price'], source=source, pid=reuse.get(source['external_id']))
    proteins.append((pid,flavor))
creatines = [(39,'NEUTRA'),(56,'FRUIT PUNCH'),(57,'GRAPE'),(58,'LIMON')]
for pid, flavor in proteins:
    old = next((p for p in before if p['kind']=='kit' and len(p['components'])==1 and p['components'][0]['product_id']==pid and p['components'][0]['quantity']==2),None)
    save(f'own-protein:{pid}', 'PROMO STAR Premium Whey Protein DOYPACK 2 LB x 2 · '+flavor,
         lookup[41]['selling_price'], 'kit', [{'product_id':pid,'quantity':2}], pid=old['id'] if old else None)
    for cid, cf in creatines:
        old = next((p for p in before if p['kind']=='kit' and {c['product_id'] for c in p['components']}=={pid,cid}),None)
        save(f'own-mixed:{pid}:{cid}', 'PROMO STAR Premium Whey DOYPACK 2 LB + Creatina 300 gr · '+flavor+' + '+cf,
             lookup[42]['selling_price'], 'kit', [{'product_id':pid,'quantity':1},{'product_id':cid,'quantity':1}], pid=old['id'] if old else None)
after = api('products')
assert len(after)==74
assert [p['id'] for p in after if p['id'] in original_order]==original_order
for p in after:
    if p['id'] in lookup: assert p['selling_price']==lookup[p['id']]['selling_price']
    assert p['selected'] and p['selected']['costArs'] is not None
for pid,_ in proteins:
    p=next(p for p in after if p['id']==pid)
    assert 'DOYPACK' in p['selected']['individual']['name'] and 'Premium' in p['selected']['individual']['name']
state['ordered_ids']=[p['id'] for p in after]
state['counts']={'individual_products':35,'own_kits':39,'total':74}
state['presentation_correction']='User confirmed Premium Whey DOYPACK 2 lb; seven flavors; existing prices and order preserved.'
state['complete']=True
MANIFEST.write_text(json.dumps(state, ensure_ascii=False, indent=2)+'\n')
print('Verified 74 products: seven Premium DOYPACK flavors and their kits. Existing prices/order preserved.')
