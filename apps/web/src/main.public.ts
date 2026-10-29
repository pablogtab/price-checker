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
  imports: [StorefrontViewComponent],
  template: `<geva-storefront-view
    [items]="items"
    [total]="total"
    [detail]="detail"
    [loading]="loading"
    [error]="error"
    (open)="open($event)"
    (back)="back()"
    (retry)="load()"
  />`,
})
class PublicStorefront implements OnInit {
  items: StorefrontProduct[] = [];
  detail: StorefrontProduct | null = null;
  loading = true;
  error = "";
  total = 0;
  private cdr = inject(ChangeDetectorRef);
  ngOnInit() {
    void this.load();
  }
  @HostListener("window:popstate") pop() {
    void this.load();
  }
  async load() {
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
      if (!r.ok)
        throw Error(
          id
            ? "Este producto ya no está disponible."
            : "No se pudo cargar el catálogo.",
        );
      const data = await r.json();
      if (id) this.detail = data;
      else {
        this.items = data.items;
        this.total = data.total;
      }
    } catch (e) {
      this.error =
        e instanceof Error ? e.message : "No se pudo cargar el catálogo.";
    } finally {
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
