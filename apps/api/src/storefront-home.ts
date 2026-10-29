import {BadRequestException} from '@nestjs/common';
import {EntityManager} from 'typeorm';
import {mediaFile,replaceMediaUsages} from './media';
export type StorefrontEntityId=number|string;
export interface HomeContent {featuredIds:StorefrontEntityId[];banners:{id:string;title:string;mediaId:number;destination:{type:'product'|'category';id:StorefrontEntityId}}[]}
export function homeContent(value:any,entries:any[],categories:any[]):HomeContent {
 const entityId=(e:any):StorefrontEntityId=>e.kind==='promo'?`promo-${e.promoId}`:e.presentationId;
 const ids=entries.map(entityId);
 if(!value||!Array.isArray(value.featuredIds)||value.featuredIds.length>48||new Set(value.featuredIds).size!==value.featuredIds.length||value.featuredIds.some((id:any)=>!ids.includes(id))||!Array.isArray(value.banners)||value.banners.length>8) throw new BadRequestException('Revisá los destacados y banners del inicio');
 const seen=new Set();
 return {featuredIds:[...value.featuredIds],banners:value.banners.map((b:any)=>{
  if(!b||typeof b.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(b.id)||seen.has(b.id)||typeof b.title!=='string'||!b.title.trim()||b.title.length>100||!Number.isSafeInteger(b.mediaId)||b.mediaId<1||!b.destination||!((b.destination.type==='product'&&ids.includes(b.destination.id))||(b.destination.type==='category'&&categories.some(c=>c.id===b.destination.id)))) throw new BadRequestException('Elegí un recurso y un destino publicado para cada banner');
  seen.add(b.id);return {id:b.id,title:b.title.trim(),mediaId:b.mediaId,destination:{type:b.destination.type,id:b.destination.id}};
 })};
}
export async function validateHomeMedia(home:HomeContent){for(const b of home.banners){try {await mediaFile(b.mediaId,'mobile');await mediaFile(b.mediaId,'desktop');}catch{throw new BadRequestException('El recurso del banner no está disponible');}}}
export async function syncHomeUsages(em:EntityManager,owner:string,home:HomeContent){
 await em.query("DELETE FROM media_asset_usages WHERE owner_type=$1 AND slot='banner'",[owner]);
 for(const b of home.banners) await replaceMediaUsages(em,owner,b.id,'banner',[b.mediaId],b.title);
}
export function publicHome(home:HomeContent|undefined,items:any[],preview:boolean){
 const all=items||[];
 return {featured:(home?.featuredIds||[]).flatMap(id=>all.filter(i=>i.id===id)),banners:(home?.banners||[]).filter(b=>b.destination.type==='product'?all.some(i=>i.id===b.destination.id):all.some(i=>i.categoryIds?.includes(b.destination.id))).map(b=>{
 const prefix=preview?`/api/media/${b.mediaId}/file`:`/api/public/storefront/media/${b.mediaId}`;
 return {id:b.id,title:b.title,destination:{...b.destination},imageUrl:prefix+'/desktop',imageSrcset:prefix+'/mobile 640w, '+prefix+'/desktop 1600w',href:b.destination.type==='category'?`/?category=${encodeURIComponent(b.destination.id)}`:`/products/${b.destination.id}`};
 })};
}
