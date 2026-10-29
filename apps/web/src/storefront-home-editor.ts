import {Component,Input,Output,EventEmitter} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SelectComponent,SelectOption} from './select';
import {MediaLibraryComponent} from './media-library';
export interface HomeContent {featuredIds:(number|string)[];banners:{id:string;title:string;mediaId:number;destination:{type:'product'|'category';id:number|string}}[]}
@Component({selector:'app-storefront-home-editor',standalone:true,imports:[FormsModule,SelectComponent,MediaLibraryComponent],template:`
<section class="home-editor" aria-label="Inicio de la tienda">
<h2>Inicio de la tienda</h2><p>Destacados y banners en el orden en que se muestran. Los precios se actualizan desde el catálogo.</p>
<h3>Destacados</h3>
<app-select label="Agregar destacado" [options]="availableOptions" [ngModel]="null" (ngModelChange)="feature($event)"/>
@for(id of home.featuredIds;track id;let index=$index){<div class="row"><span>{{title(id)}}</span><button [disabled]="index===0" (click)="move(home.featuredIds,index,-1)" [attr.aria-label]="'Subir destacado '+title(id)">↑</button><button [disabled]="index===home.featuredIds.length-1" (click)="move(home.featuredIds,index,1)" [attr.aria-label]="'Bajar destacado '+title(id)">↓</button><button (click)="home.featuredIds.splice(index,1);changed.emit()" [attr.aria-label]="'Quitar destacado '+title(id)">Quitar</button></div>}
<h3>Banners</h3><p>Usá una imagen de biblioteca y enlazá a una categoría o ficha seleccionada para publicar.</p>
@for(b of home.banners;track b.id;let index=$index){<article class="banner-edit">
<div class="row"><strong>Banner {{index+1}}</strong><button [disabled]="index===0" (click)="move(home.banners,index,-1)" aria-label="Subir banner">↑</button><button [disabled]="index===home.banners.length-1" (click)="move(home.banners,index,1)" aria-label="Bajar banner">↓</button><button (click)="home.banners.splice(index,1);changed.emit()" aria-label="Quitar banner">Quitar</button></div>
<label>Título del banner<input aria-label="Título del banner" [(ngModel)]="b.title" (ngModelChange)="changed.emit()" maxlength="100"/></label>
<app-select label="Destino del banner" [options]="destinationOptions" [ngModel]="destinationValue(b)" (ngModelChange)="setDestination(b,$event)"/>
<div class="resource">@if(b.mediaId){<img [src]="'/api/media/'+b.mediaId+'/file/mobile'" [alt]="b.title"/>}<button (click)="selecting=b.id">{{b.mediaId?'Cambiar imagen del banner':'Elegir imagen del banner'}}</button></div>
@if(selecting===b.id){<button (click)="selecting=null">Cerrar biblioteca</button><app-media-library [selectionMode]="true" (assetSelected)="pick(b,$event)"/>}
</article>}
<button (click)="addBanner()" [disabled]="home.banners.length>=8||!destinationOptions.length">Agregar banner</button>
</section>`,styles:[`
.home-editor{background:#fff;border:1px solid #dce2d7;border-radius:12px;padding:24px;margin-top:24px}.home-editor h2{font-size:18px;margin:0 0 8px}.home-editor h3{font-size:15px;margin:24px 0 12px}.home-editor p{font-size:13px;line-height:1.5;color:#667260}.row{display:flex;align-items:center;gap:8px;margin:12px 0}.row span,.row strong{flex:1;min-width:0}.home-editor button{border:1px solid #cbd5c5;border-radius:7px;padding:10px;background:white;color:#263d2a;font:inherit;cursor:pointer}.home-editor button:disabled{opacity:.4;cursor:default}.banner-edit{border:1px solid #dce2d7;padding:16px;border-radius:8px;margin:14px 0;display:grid;gap:12px}.banner-edit label{display:grid;gap:8px;font-size:13px}.banner-edit input{font:inherit;padding:12px;border:1px solid #cbd5c5;border-radius:7px;min-width:0}.resource{display:flex;align-items:center;gap:16px}.resource img{width:90px;height:75px;object-fit:contain}.home-editor app-select{max-width:550px;display:block}@media(max-width:700px){.home-editor{padding:16px}.row{flex-wrap:wrap}.row span,.row strong{flex-basis:100%}}
`]})
export class StorefrontHomeEditorComponent{
 @Input() home:HomeContent={featuredIds:[],banners:[]};@Input() entries:any[]=[];@Input() categories:{id:string;name:string}[]=[];@Output() changed=new EventEmitter<void>();selecting:string|null=null;
 id(e:any):number|string{return e.kind==='promo'?`promo-${e.promoId}`:e.presentationId;}
 title(id:number|string){return this.entries.find(e=>this.id(e)===id)?.title||'Producto retirado';}
 get availableOptions():SelectOption[]{return this.entries.filter(e=>!this.home.featuredIds.includes(this.id(e))).map(e=>({value:this.id(e),label:e.title}));}
 get destinationOptions():SelectOption[]{return [...this.categories.map(c=>({value:'category:'+c.id,label:'Categoría · '+c.name})),...this.entries.map(e=>({value:'product:'+this.id(e),label:'Ficha · '+e.title}))];}
 destinationValue(b:any){return b.destination.type+':'+b.destination.id;}
 setDestination(b:any,value:string){const [type,id]=value.split(':');b.destination={type,id:type==='product'&&!id.startsWith('promo-')?Number(id):id};this.changed.emit();}
 feature(id:number|string){if(id&&!this.home.featuredIds.includes(id)){this.home.featuredIds.push(id);this.changed.emit();}}
 move(values:any[],i:number,d:number){[values[i],values[i+d]]=[values[i+d],values[i]];this.changed.emit();}
 addBanner(){const b:any={id:crypto.randomUUID(),title:'',mediaId:0,destination:{}};this.setDestination(b,String(this.destinationOptions[0].value));this.home.banners.push(b);this.changed.emit();}
 pick(b:any,asset:any){b.mediaId=asset.id;this.selecting=null;this.changed.emit();}
}
