import { StorefrontCart } from "./storefront-cart";
import { StorefrontCartView } from "./storefront-cart-view";
import "zone.js";
import {
  Component,
  HostListener,
  OnInit,
  inject,
  ChangeDetectorRef,
  provideZoneChangeDetection,
} from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { registerLocaleData } from "@angular/common";
import esAR from "@angular/common/locales/es-AR";
import { StorefrontViewComponent, StorefrontProduct } from "./storefront-view";
registerLocaleData(esAR);
@Component({
  selector: "geva-storefront",
  standalone: true,
  imports: [StorefrontViewComponent, StorefrontCartView],
  template: `@if (cartPage) {
      <geva-storefront-cart />
    } @else {
      <geva-storefront-view
        [cartActive]="true"
        [items]="items"
        [home]="home"
        (destination)="destination($event)"
        [total]="total"
        [contextQuery]="contextQuery"
        [categories]="categories"
        [brands]="brands"
        [q]="query.q || ''"
        [category]="query.category || ''"
        [brand]="query.brand || ''"
        [order]="query.order || 'manual'"
        [page]="page"
        [pageSize]="pageSize"
        (filterChange)="filter($event)"
        [detail]="detail"
        [loading]="loading"
        [error]="error"
        (open)="open($event)"
        (back)="back()"
        (retry)="load()"
      />
    }`,
})
class PublicStorefront implements OnInit {
  cartPage = false;
  get contextQuery() {
    return location.search;
  }
  home: any = { featured: [], banners: [] };
  destination(d: any) {
    if (d.type === "category") this.filter({ category: d.id, page: 1 });
    else {
      history.pushState(
        null,
        "",
        (typeof d.id === "string" && d.id.startsWith("promo-")
          ? "/promos/" + d.id.slice(6)
          : "/products/" + d.id) + location.search,
      );
      void this.load();
      window.scrollTo(0, 0);
    }
  }
  private requestId = 0;
  categories: { id: string; name: string }[] = [];
  brands: { id: string; name: string }[] = [];
  query: Record<string, string> = {};
  page = 1;
  pageSize = 24;
  filter(change: Record<string, string | number>) {
    const params = new URLSearchParams(location.search);
    for (const [key, value] of Object.entries(change)) {
      if (value) params.set(key, String(value));
      else params.delete(key);
    }
    if (change.page === 1) params.delete("revision");
    history.pushState(null, "", "/?" + params);
    void this.load();
  }
  items: StorefrontProduct[] = [];
  detail: StorefrontProduct | null = null;
  loading = true;
  error = "";
  total = 0;
  private cdr = inject(ChangeDetectorRef);
  private cart = inject(StorefrontCart);
  ngOnInit() {
    this.cart.start();
    void this.load();
  }
  @HostListener("window:popstate") pop() {
    void this.load();
  }
  async load() {
    const requestId = ++this.requestId;
    this.cartPage = location.pathname === "/cart";
    if (this.cartPage) {
      this.cdr.markForCheck();
      return;
    }
    this.query = Object.fromEntries(new URLSearchParams(location.search));
    this.page = Number(this.query.page) || 1;
    this.pageSize = Number(this.query.pageSize) || 24;
    this.loading = true;
    this.error = "";
    this.detail = null;
    try {
      const promo = location.pathname.startsWith("/promos/");
      const id = location.pathname.match(
        /^\/(?:products|promos)\/([1-9][0-9]*)$/,
      )?.[1];
      const r = await fetch(
        "/api/public/storefront/" +
          (id
            ? (promo ? "promos/" : "presentations/") + id
            : "catalog" + location.search),
      );
      if (r.status === 409 && !id) {
        const params = new URLSearchParams(location.search);
        params.delete("revision");
        params.set("page", "1");
        history.replaceState(null, "", "/?" + params);
        await this.load();
        return;
      }
      if (!r.ok)
        throw Error(
          id
            ? "Este producto ya no está disponible."
            : "No se pudo cargar el catálogo.",
        );
      const data = await r.json();
      if (requestId !== this.requestId) return;
      if (id) this.detail = data;
      else {
        this.items = data.items;
        this.home = data.home;
        this.total = data.total;
        this.categories = data.categories;
        this.brands = data.brands;
        this.page = data.page;
        this.pageSize = data.pageSize;
        const params = new URLSearchParams(location.search);
        params.set("revision", String(data.revision));
        history.replaceState(null, "", "/?" + params);
      }
    } catch (e) {
      if (requestId !== this.requestId) return;
      this.error =
        e instanceof Error ? e.message : "No se pudo cargar el catálogo.";
    } finally {
      if (requestId !== this.requestId) return;
      this.loading = false;
      this.cdr.markForCheck();
    }
  }
  open(item: StorefrontProduct) {
    history.pushState(
      null,
      "",
      (item.kind === "promo"
        ? "/promos/" + String(item.id).slice(6)
        : "/products/" + item.id) + location.search,
    );
    void this.load();
    window.scrollTo(0, 0);
  }
  back() {
    history.pushState(null, "", "/" + location.search);
    void this.load();
    window.scrollTo(0, 0);
  }
}
bootstrapApplication(PublicStorefront, {
  providers: [provideZoneChangeDetection()],
}).catch(console.error);
