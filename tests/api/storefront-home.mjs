import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
const base=process.env.TEST_API_URL;
if(!base||!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local API required');
async function api(path,body,method='POST',status){const r=await fetch(base+'/api/'+path,body===undefined?{}:{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});const v=await r.json();assert.equal(r.status,status??(body===undefined?200:method==='POST'?201:200),JSON.stringify(v));return v;}
test('home participates in immutable revisions and resolves live featured prices and destinations',async()=>{
 const p=await api('products',{name:'Creatina 300 g',selling_price:'12500'});await api(`products/${p.id}/stock`,{quantity:4},'PUT');
 const media=await api('media',{name:'Creatina',data:'data:image/png;base64,'+(await readFile(new URL('../fixtures/media.png',import.meta.url))).toString('base64')});
 let d=await api('storefront/draft');const home={featuredIds:[p.presentation_id],banners:[{id:'creatina',title:'Creatina monohidrato',mediaId:media.id,destination:{type:'category',id:'creatina'}}]};
 d=await api('storefront/draft',{...d,entries:[{presentationId:p.presentation_id,title:'Creatina 300 g',description:'Monohidrato',variantIds:[p.id],imageKey:null,categoryIds:['creatina']}],categories:[{id:'creatina',name:'Creatinas'}],home},'PUT');
 assert.deepEqual(d.home,home);assert.deepEqual((await api('storefront/preview')).home.featured.map(x=>x.price),['12500']);
 await api('storefront/publish',{revision:d.revision});const published=await api('public/storefront/catalog');assert.equal(published.home.banners[0].href,'/?category=creatina');
 await api(`presentations/${p.presentation_id}/price`,{catalog_price:'14000'},'PUT');assert.equal((await api('public/storefront/catalog')).home.featured[0].price,'14000');
 const edited=await api('storefront/draft',{...d,home:{...home,banners:[{...home.banners[0],title:'Nuevo título'}]}},'PUT');assert.equal((await api('public/storefront/catalog')).home.banners[0].title,'Creatina monohidrato');
 await api('storefront/publish',{revision:d.revision},'POST',409);
 await api('storefront/draft',{...edited,home:{...home,featuredIds:[9999999]}},'PUT',400);assert.equal((await api('storefront/draft')).revision,edited.revision);
 await api(`products/${p.id}/stock`,{quantity:0},'PUT');const withdrawn=await api('public/storefront/catalog');assert.equal(withdrawn.home.featured.length,0);assert.equal(withdrawn.home.banners.length,0);
 await api('storefront/publish',{revision:edited.revision},'POST',400);assert.equal((await api('public/storefront/catalog')).revision,d.revision);
});
