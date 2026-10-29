import { DashboardComponent } from "./dashboard";
import { CatalogQuoteComponent, CatalogQuoteState, SupplierQuoteItem } from "./catalog-quote";
import {PriceListsComponent} from "./price-lists";
import { CustomersComponent } from "./customers";
import { ProductImageComponent } from "./ui/product-image";
import { ShellComponent } from "./ui/shell";
import { ButtonDirective } from "./ui/button";
import { IconComponent } from "./ui/icon";
import { ActionButton } from "./ui/action-button";
import {
  Component,
  ChangeDetectorRef,
  inject,
  OnInit,
  OnDestroy,
  HostListener,
  ViewChild,
  ElementRef,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { HttpClient, HttpParams } from "@angular/common/http";
import { A11yModule } from "@angular/cdk/a11y";
import { firstValueFrom } from "rxjs";
import { PriceAnalysisComponent } from "./price-analysis";
import { InstallComponent } from "./install";
import { SalesComponent } from "./sales";
import { CashComponent } from "./cash";
import { SelectComponent } from "./select";
import { PurchasesComponent } from "./purchases";
import { SupplierLoginComponent } from "./supplier-login";
import { FilterSelectComponent, FilterOption } from "./filter-select";
import Decimal from "decimal.js";
Decimal.set({ precision: 40 });

@Component({
  selector: "app-root",
  standalone: true,
  imports: [DashboardComponent, PriceListsComponent, CatalogQuoteComponent,
    PriceAnalysisComponent,
    InstallComponent,
    CommonModule,
    FormsModule,
    A11yModule,
    ShellComponent,
    ProductImageComponent,
    ButtonDirective,
    IconComponent,
    ActionButton,

    SupplierLoginComponent,
    PurchasesComponent,
    SelectComponent,
    CashComponent,
    SalesComponent,
    CustomersComponent,
    FilterSelectComponent,
  ],
  templateUrl: "./app.html",
})
export class AppComponent implements OnInit, OnDestroy {
  http = inject(HttpClient);
  cdr = inject(ChangeDetectorRef);
  view = "dashboard";
  products: any[] = [];
  presentationPriceValues: Record<number,string> = {};
  get unresolvedPresentations() {
    const groups = new Map<number,any>();
    for(const p of this.products.filter(p=>p.price_unresolved)) {
      if(!groups.has(p.presentation_id)) groups.set(p.presentation_id,{id:p.presentation_id,name:p.variant_group||p.name,variants:[]});
      groups.get(p.presentation_id).variants.push(p);
    }
    return [...groups.values()];
  }
  async resolvePrice(id:number) {
    if(this.busy) return;
    this.busy=true;
    try {
      await this.api('PUT',`presentations/${id}/price`,{catalog_price:this.presentationPriceValues[id]});
      this.products=await this.api('GET','products');
      delete this.presentationPriceValues[id];
      this.toast('Precio común aplicado a todos los sabores.');
    } catch(e:any) {this.fail(e);} finally {this.busy=false;this.cdr.markForCheck();}
  }

  catalog: any = { items: [], total: 0 };
  quoteState: CatalogQuoteState = { items: [], markup: "10", prices: {} };
  quoteDefaultMarkup = "10";
  isQuoteSelected(id: number) { return this.quoteState.items.some(item => item.id === id); }
  toggleQuote(item: SupplierQuoteItem) {
    if(this.isQuoteSelected(item.id)) {
      this.quoteState.items = this.quoteState.items.filter(selected => selected.id !== item.id);
      delete this.quoteState.prices[item.id];
    } else {
      if(!this.quoteState.items.length) this.quoteState.markup = this.settings.supplier_quote_markup_percent ?? "10";
      this.quoteState.items = [...this.quoteState.items, {...item}];
    }
  }
  get quotePageSelected() { return this.catalog.items.length > 0 && this.catalog.items.every((item: SupplierQuoteItem) => this.isQuoteSelected(item.id)); }
  toggleQuotePage() {
    const remove = this.quotePageSelected;
    for(const item of this.catalog.items) if(this.isQuoteSelected(item.id) === remove) this.toggleQuote(item);
  }
  facets: any = { providers: [], brands: [], categories: [] };
  runs: any[] = [];
  settings: any = { usd_ars: null };
  salesStats: any = {
    count: 0,
    total: "0",
    recent_total: "0",
    paid: "0",
    pending: "0",
    profit: "0",
    missing_cost: 0,
  };
  purchaseStats: any = { total: 0, recent: 0, totals: [] };
  rate = "";
  error = "";
  offline = false;
  renewingSession = false;
  notice = "";
  loading = true;
  busy = false;
  filters: any = {
    search: "",
    provider: [],
    brand: [],
    category: [],
    currency: [],
    stock: [],
    own_stock: [],
    linked: [],
    basis: [],
  };
  sort = "name";
  direction = "asc";
  page = 1;
  size = 30;
  editing: any = null;
  priceProductId: number | null = null;
  inlinePrice: any = "";
  inlinePriceError = "";
  inlinePriceIsKit = false;
  inlineKitMode = "final";
  get inlineIsDiscount() {
    return this.inlinePriceIsKit && this.inlineKitMode === "discount";
  }
  changeInlineKitMode() {
    const p = this.products.find((p) => p.id === this.priceProductId);
    if (p)
      this.inlinePrice = this.inlineIsDiscount
        ? p.kit_discount_percent
        : p.selling_price;
    this.inlinePriceError = "";
  }
  @ViewChild("inlinePriceInput") set priceInput(
    input: ElementRef<HTMLInputElement> | undefined,
  ) {
    if (input) {
      // Wait for ngModel to write the value before selecting it.
      setTimeout(() => {
        if (!input.nativeElement.isConnected) return;
        input.nativeElement.focus();
        input.nativeElement.select();
      });
    }
  }
  startPriceEdit(p: any) {
    if (this.busy) return;
    if(p.price_unresolved) { this.error='Esta presentación tiene precios diferentes. Elegí el precio común en Precios pendientes de resolver.'; return; }
    this.inlinePriceIsKit = p.kind === "kit";
    this.priceProductId = p.id;
    this.inlineKitMode = p.kit_pricing_mode || "final";
    this.inlinePrice = this.inlineIsDiscount
      ? p.kit_discount_percent
      : p.selling_price;
    this.inlinePriceError = "";
  }
  cancelPriceEdit() {
    if (this.busy) return;
    this.priceProductId = null;
    this.inlinePriceError = "";
  }
  get validInlinePrice() {
    if (this.inlinePrice === "" || this.inlinePrice == null) return false;
    try {
      const price = new Decimal(this.inlinePrice);
      return (
        price.isFinite() &&
        price.gte(0) &&
        price.lte(this.inlineIsDiscount ? 100 : "1e15") &&
        (!this.inlineIsDiscount || price.decimalPlaces() <= 8)
      );
    } catch {
      return false;
    }
  }
  async saveInlinePrice() {
    if (this.busy || !this.validInlinePrice || this.priceProductId == null)
      return;
    this.busy = true;
    this.inlinePriceError = "";
    const id = this.priceProductId;
    try {
      await this.api(
        "PUT",
        `products/${id}/${this.inlinePriceIsKit ? "kit-pricing" : "selling-price"}`,
        {
          ...(this.inlinePriceIsKit
            ? { kit_pricing_mode: this.inlineKitMode }
            : {}),
          [this.inlineIsDiscount ? "kit_discount_percent" : "selling_price"]:
            new Decimal(this.inlinePrice).toString(),
        },
      );
      this.products = await this.api("GET", "products");
      this.priceProductId = null;
      this.toast(
        this.inlinePriceIsKit
          ? "Precio de la promo actualizado."
          : "Precio común actualizado en todos los sabores.",
      );
    } catch (e: any) {
      this.inlinePriceError =
        e?.error?.message || "No se pudo guardar el precio. Intentá de nuevo.";
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  quickItem: any = null;
  quickPrice = "";
  linking: any = null;
  linkProvider = "";
  linkSearch = "";
  linkResults: any[] = [];
  individual: any = null;
  kit: any = null;
  confirmSame = false;
  confirmPresentation = false;
  packUnits = 1;
  kitUnits: any = 1;
  quickUnits: any = 1;
  confirmPack = false;
  tab = "individual";
  filterOptions(key: string): FilterOption[] {
    if (key === "provider")
      return this.facets.providers.map((p: any) => ({
        value: String(p.id),
        label: p.name,
      }));
    if (key === "brand")
      return this.facets.brands.map((label: string) => ({
        value: label,
        label,
      }));
    if (key === "category")
      return this.facets.categories.map((label: string) => ({
        value: label,
        label,
      }));
    const choices: Record<string, [string, string][]> = {
      currency: [
        ["ARS", "ARS"],
        ["USD", "USD"],
      ],
      stock: [
        ["in", "Con stock"],
        ["out", "Sin stock"],
      ],
      own_stock: [
        ["in", "Con stock"],
        ["out", "Sin stock"],
        ["unset", "Sin cargar"],
      ],
      linked: [
        ["yes", "Vinculados"],
        ["no", "Sin vincular"],
      ],
      basis: [
        ["kit", "Pack del proveedor"],
        ["individual", "Individual"],
        ["pack", "Caja / pack"],
        ["assembled", "Kit propio"],
        ["missing", "Sin costo"],
      ],
    };
    return (choices[key] || []).map(([value, label]) => ({ value, label }));
  }
  deleting: any = null;
  stocking: any = null;
  stockType = "set";
  stockAmount: any = "";
  stockNote = "";
  stockMovements: any[] = [];
  stockLoading = false;
  private stockSequence = 0;
  imageStatus: any = { downloaded: 0, pending: 0, failed: 0 };
  private imagePolling = false;
  kitBaseLabel(p: any): string {
    const max = (p.components || [])
      .reduce(
        (total: Decimal, c: any) =>
          total.plus(
            new Decimal(c.selling_price_max ?? c.selling_price).mul(c.quantity),
          ),
        new Decimal(0),
      )
      .toString();
    return (
      this.amount(p.kit_base_price) +
      (max !== p.kit_base_price ? " – " + this.amount(max) : "")
    );
  }
  productPhotos(p: any): string[] {
    const keys = p.custom_image_path
      ? [p.custom_image_path]
      : p.kind === "kit"
        ? p.components.map((c: any) => c.image_path).filter(Boolean)
        : [p.image_path].filter(Boolean);
    return [...new Set(keys)] as string[];
  }
  async pollImages() {
    if (this.imagePolling) return;
    this.imagePolling = true;
    try {
      const status = await this.api("GET", "images/status");
      const changed = status.downloaded !== this.imageStatus.downloaded;
      this.imageStatus = status;
      if (changed) {
        this.products = await this.api("GET", "products");
        if (this.view === "catalog") await this.loadCatalog();
      }
    } catch {
    } finally {
      this.imagePolling = false;
      this.cdr.markForCheck();
    }
  }
  private timer: any;
  private searchTimer: any;
  private noticeTimer: any;
  private catalogSequence = 0;
  private linkSequence = 0;
  ngOnInit() {
    this.view = this.pathView();
    this.sort = "name";
    void this.load();
    this.timer = setInterval(() => {
      void this.poll();
      void this.pollImages();
    }, 4000);
    void this.pollImages();
  }
  ngOnDestroy() {
    clearInterval(this.timer);
    clearTimeout(this.searchTimer);
    clearTimeout(this.noticeTimer);
  }
  @HostListener("window:popstate") onPop() {
    this.view = this.pathView();
    this.sort = "name";
    this.page = 1;
    void this.loadCatalog();
  }
  pathView() {
    const v = location.pathname === "/sales/new" ? "new-sale" : location.pathname.startsWith("/customers/") ? "customers" : location.pathname.slice(1);
    return [
      "dashboard",
      "price-lists",
      "products",
      "catalog",
      "settings",
      "purchases",
      "cash",
      "sales",
      "new-sale",
      "customers",
    ].includes(v)
      ? v
      : "dashboard";
  }
  async api<T = any>(method: string, path: string, body?: any): Promise<T> {
    try {
      return await firstValueFrom(
        this.http.request<T>(
          method,
          "/api/" + path,
          body === undefined ? {} : { body },
        ),
      );
    } finally {
      this.cdr.markForCheck();
    }
  }
  fail(e: any) {
    this.error =
      e?.error?.message ||
      "No se pudo completar la operación. Revisá que el servidor esté disponible.";
  }
  toast(message: string) {
    this.notice = message;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      this.notice = "";
      this.cdr.markForCheck();
    }, 5000);
  }
  async load() {
    try {
      const [p, f, r, s, buys, sales] = await Promise.all([
        this.api("GET", "products"),
        this.api("GET", "facets"),
        this.api("GET", "refresh-runs"),
        this.api("GET", "settings"),
        this.api("GET", "purchases/summary"),
        this.api("GET", "sales/summary"),
      ]);
      this.products = p;
      this.facets = f;
      this.runs = r;
      this.settings = s;
      this.quoteDefaultMarkup = s.supplier_quote_markup_percent ?? "10";
      this.purchaseStats = buys;
      this.salesStats = sales;
      this.rate = s.usd_ars || "";
      if (this.view === "catalog") await this.loadCatalog();
      this.error = "";
    } catch (e) {
      this.fail(e);
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }
  async poll() {
    try {
      const runs: any[] = await this.api("GET", "refresh-runs");
      const changed =
        JSON.stringify(runs.map((r) => [r.id, r.status])) !==
        JSON.stringify(this.runs.map((r) => [r.id, r.status]));
      this.runs = runs;
      this.offline = false;
      if (changed) {
        this.products = await this.api("GET", "products");
        this.facets = await this.api("GET", "facets");
        if (this.view === "catalog") await this.loadCatalog();
      }
    } catch {
      this.offline = true;
    } finally {
      this.cdr.markForCheck();
    }
  }
  navigate(v: string) {
    this.view = v;
    history.pushState({}, "", v === "dashboard" ? "/" : v === "new-sale" ? "/sales/new" : "/" + v);
    this.page = 1;
    this.filters = {
      search: "",
      provider: [],
      brand: [],
      category: [],
      currency: [],
      stock: [],
      own_stock: [],
      linked: [],
      basis: [],
    };
    this.sort = "name";
    if (v === "catalog") void this.loadCatalog();
  }
  get activeRun() {
    return this.runs.find((r) => ["queued", "running"].includes(r.status));
  }
  get refreshProgress() {
    const run = this.activeRun;
    if (!run) return null;
    const p = run.progress;
    if (run.status === "queued")
      return {
        percent: null,
        label: "En cola",
        detail: "Esperando al worker…",
      };
    if (p?.phase === "importing")
      return {
        percent: 99,
        label: "99% · Guardando precios",
        detail: "Validando y guardando el catálogo completo…",
      };
    if (p?.page)
      return {
        percent: p.percent,
        label: `${p.percent}% · Página ${p.page} de ${p.total_pages}`,
        detail: `${p.products} productos leídos · ${p.remaining_seconds == null ? "Calculando tiempo restante…" : p.remaining_seconds < 60 ? "Menos de 1 minuto restante aprox." : `~${Math.ceil(p.remaining_seconds / 60)} min restantes`}`,
      };
    const elapsed = Math.max(
      0,
      (Date.now() - Date.parse(run.started_at)) / 60000,
    );
    return {
      percent: null,
      label: "Actualización en curso",
      detail: `Tiempo transcurrido: ${Math.floor(elapsed)} min · Duración habitual: 10–15 min`,
    };
  }
  get latestPriceAnalysis() {
    return this.runs.find((r) => r.status === "success" && r.price_analysis);
  }
  get latestRun() {
    return this.runs[0];
  }
  get staleCount() {
    return this.products.filter((p) => p.selected?.cost?.stale).length;
  }
  isLowStock(p: any) {
    return (
      p.minimum_stock != null &&
      p.own_stock != null &&
      p.own_stock <= p.minimum_stock
    );
  }
  get stockMetrics() {
    const units = this.products.filter((p) => p.kind !== "kit");
    let quantity = 0,
      missingStock = 0,
      missingCost = 0,
      out = 0,
      negative = 0;
    let cost = new Decimal(0),
      retail = new Decimal(0),
      profit = new Decimal(0);
    for (const p of units) {
      if (p.own_stock == null) {
        missingStock++;
        continue;
      }
      const stock = Math.max(0, p.own_stock);
      quantity += stock;
      if (p.own_stock <= 0) out++;
      if (p.own_stock < 0) negative++;
      const sale = new Decimal(p.selling_price).mul(stock);
      retail = retail.plus(sale);
      if (p.own_stock > 0 && p.selected?.costArs == null) {
        missingCost++;
        continue;
      }
      if (p.selected?.costArs != null) {
        const value = new Decimal(p.selected.costArs).mul(stock);
        cost = cost.plus(value);
        profit = profit.plus(sale.minus(value));
      }
    }
    return {
      quantity,
      negative,
      missingStock,
      missingCost,
      out,
      cost: cost.toString(),
      retail: retail.toString(),
      profit: profit.toString(),
      units: units.length,
      low: units.filter((p) => this.isLowStock(p)).length,
    };
  }
  get missingCount() {
    return this.products.filter((p) => !p.selected?.cost).length;
  }
  productOffers(p: any) {
    return p.kind === "kit"
      ? p.components.flatMap((c: any) => c.offers || [])
      : p.offers || [];
  }
  get linkedCount() {
    return this.products.filter((p) => this.productOffers(p).length).length;
  }
  get readyCount() {
    return this.products.filter(
      (p) => p.selected?.costArs != null && !p.selected?.cost?.stale,
    ).length;
  }
  get filtered() {
    let rows = this.products.filter((p) => {
      const offers = this.productOffers(p);
      const s = this.filters;
      const haystack =
        `${p.name} ${p.code || ""} ${p.barcode || ""} ${offers.map((o: any) => [o.individual?.name, o.kit?.name, o.individual?.barcode, o.kit?.barcode, o.individual?.internal_code, o.kit?.internal_code].filter(Boolean).join(" ")).join(" ")}`.toLowerCase();
      if (
        s.search &&
        !s.search
          .toLowerCase()
          .trim()
          .split(/\s+/)
          .every((term: string) => haystack.includes(term))
      )
        return false;
      const accepts = (values: string[], actual: string) =>
        !values.length || values.includes(actual);
      const basis = p.selected?.cost
        ? p.kind === "kit"
          ? "assembled"
          : p.selected.cost.basis
        : "missing";
      if (!accepts(s.basis, basis)) return false;
      if (
        !accepts(
          s.own_stock,
          p.own_stock == null ? "unset" : p.own_stock > 0 ? "in" : "out",
        )
      )
        return false;
      const matching = offers.filter(
        (o: any) =>
          accepts(s.provider, String(o.provider_id)) &&
          accepts(s.currency, o.cost?.currency) &&
          (!s.stock.length ||
            (o.cost?.stock != null &&
              accepts(s.stock, Number(o.cost.stock) > 0 ? "in" : "out"))) &&
          accepts(s.brand, this.itemBrand(o)) &&
          accepts(s.category, this.itemCategory(o)),
      );
      if (
        [s.provider, s.currency, s.stock, s.brand, s.category].some(
          (values) => values.length,
        ) &&
        !matching.length
      )
        return false;
      if (!accepts(s.linked, offers.length ? "yes" : "no")) return false;

      return true;
    });
    {
      rows = [...rows].sort((a, b) => {
        const stockGroup =
          Number(Number(b.own_stock) > 0) - Number(Number(a.own_stock) > 0);
        if (stockGroup) return stockGroup;
        const field = this.sort;
        const value = (p: any): string | number | null => {
          if (field === "name") return p.name;
          const v =
            field === "selling"
              ? p.selling_price
              : field === "cost"
                ? p.selected?.costArs
                : field === "stock"
                  ? p.selected?.cost?.stock
                  : field === "ownStock"
                    ? p.own_stock
                    : p.selected?.margin;
          return v == null ? null : Number(v);
        };
        const av = value(a),
          bv = value(b);
        if (av == null) return bv == null ? a.id - b.id : 1;
        if (bv == null) return -1;
        return (
          (typeof av === "string"
            ? av.localeCompare(String(bv))
            : av - Number(bv)) * (this.direction === "asc" ? 1 : -1)
        );
      });
    }
    return rows;
  }
  itemBrand(o: any) {
    return (o.individual || o.kit)?.brand || "";
  }
  itemCategory(o: any) {
    return (o.individual || o.kit)?.category || "";
  }
  get visibleProducts() {
    return this.filtered.slice(
      (this.page - 1) * this.size,
      this.page * this.size,
    );
  }
  get total() {
    return this.view === "catalog" ? this.catalog.total : this.filtered.length;
  }
  get pages() {
    return Math.max(1, Math.ceil(this.total / this.size));
  }
  get showPagination() {
    return true;
  }
  changed() {
    this.page = 1;
    if (this.view === "catalog") {
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => void this.loadCatalog(), 200);
    }
  }
  sortColumn(field: string) {
    if (this.sort === field)
      this.direction = this.direction === "asc" ? "desc" : "asc";
    else {
      this.sort = field;
      this.direction = "asc";
    }
    this.changed();
  }
  sortAria(field: string) {
    return this.sort === field
      ? this.direction === "asc"
        ? "ascending"
        : "descending"
      : "none";
  }
  sortArrow(field: string) {
    return this.sort === field ? (this.direction === "asc" ? " ↑" : " ↓") : "";
  }
  clearFilters() {
    for (const k of Object.keys(this.filters))
      this.filters[k] = k === "search" ? "" : [];
    this.changed();
  }
  async loadCatalog() {
    const seq = ++this.catalogSequence;
    try {
      let params = new HttpParams();
      for (const [k, v] of Object.entries({
        ...this.filters,
        sort: this.sort,
        direction: this.direction,
        page: this.page,
        size: this.size,
      }))
        if (Array.isArray(v)) {
          for (const value of v) params = params.append(k, String(value));
        } else if (v) params = params.set(k, String(v));
      const result = await firstValueFrom(
        this.http.get("/api/catalog", { params }),
      );
      if (seq === this.catalogSequence) this.catalog = result;
    } catch (e) {
      this.fail(e);
    } finally {
      this.cdr.markForCheck();
    }
  }
  changePage(delta: number) {
    this.page = Math.max(1, Math.min(this.pages, this.page + delta));
    if (this.view === "catalog") void this.loadCatalog();
  }
  catalogPriceArs(item: any): string | null {
    if (item.currency === "ARS") return item.price;
    if (item.currency !== "USD" || !this.settings.usd_ars) return null;
    const rate = new Decimal(this.settings.usd_ars);
    return rate.isFinite() && rate.gt(0)
      ? new Decimal(item.price).mul(rate).toString()
      : null;
  }
  amount(v: any, currency = "ARS") {
    return v == null
      ? "—"
      : new Intl.NumberFormat("es-AR", {
          style: "currency",
          currency,
          minimumFractionDigits: currency === "USD" ? 4 : 2,
          maximumFractionDigits: currency === "USD" ? 4 : 2,
        }).format(Number(v));
  }
  percent(v: any) {
    return v == null
      ? "—"
      : new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(
          Number(v),
        ) + "%";
  }
  date(v: any) {
    return v
      ? new Intl.DateTimeFormat("es-AR", {
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(v))
      : "Sin actualizar";
  }
  sourceDate(v: any) {
    return v ? String(v).slice(0, 10).split("-").reverse().join("/") : "—";
  }
  basis(p: any) {
    if (p.kind === "kit")
      return p.selected?.cost
        ? p.selected.cost.stale
          ? "Kit propio · costo anterior"
          : "Suma de componentes"
        : "Kit sin costo completo";
    if (p.selected?.cost?.basis === "pack")
      return p.selected.individual_units === 1
        ? "Caja completa"
        : `Caja ÷ ${p.selected.individual_units}`;
    return !p.selected?.cost
      ? "Sin costo"
      : p.selected.cost.stale
        ? "Costo anterior"
        : p.selected.cost.basis === "kit"
          ? `Pack ÷ ${p.selected.cost.units}`
          : "Individual";
  }
  async refresh() {
    this.error = "";
    try {
      await this.api(
        "POST",
        "providers/" + (this.facets.providers[0]?.id || 1) + "/refresh",
        {},
      );
      this.runs = await this.api("GET", "refresh-runs");
      this.toast("Actualización solicitada. Podés seguir usando la app.");
    } catch (e) {
      this.fail(e);
    } finally {
      this.cdr.markForCheck();
    }
  }
  sessionSaved() {
    this.renewingSession = false;
    this.toast("Sesión de Coverweb renovada. Ya podés actualizar los precios.");
  }
  suggestedUnits(item: any) {
    const match = /\bx\s*(\d+)\b/i.exec(item?.name || "");
    const n = match ? Number(match[1]) : 1;
    return n > 0 && n <= 10000 ? n : 1;
  }
  startQuickCreate(item: any) {
    this.quickItem = item;
    this.quickUnits = this.suggestedUnits(item);
    this.quickPrice = "";
    this.error = "";
  }
  async quickCreate() {
    if (this.busy || !this.quickItem || this.quickPrice === "") return;
    const item = this.quickItem;
    this.busy = true;
    try {
      await this.api("POST", "products", {
        name: item.name,
        code: item.internal_code,
        barcode: item.barcode,
        selling_price: String(this.quickPrice),
        source_item_id: item.id,
        source_units: this.quickUnits,
      });
      this.products = await this.api("GET", "products");
      this.quickItem = null;
      this.quickPrice = "";
      await this.loadCatalog();
      this.toast("Producto creado y vinculado al proveedor.");
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  edit(p?: any, item?: any) {
    this.error = "";
    const enteredPrice =
      item && this.quickItem?.id === item.id ? this.quickPrice : "";
    if (item) this.quickUnits = this.suggestedUnits(item);
    this.quickItem = null;
    this.editing = p
      ? { ...p, components: (p.components || []).map((c: any) => ({ ...c })) }
      : {
          kind: "product",
          components: [],
          name: item?.name || "",
          code: item?.internal_code || "",
          barcode: item?.barcode || "",
          selling_price: enteredPrice || "0",
          preferred_provider_id: null,
          source: item || null,
        };
  }
  editKit() {
    this.edit();
    this.editing.kind = "kit";
    this.editing.kit_pricing_mode = "final";
    this.editing.kit_discount_percent = "0";
    this.editing.components = [{ product_id: "", quantity: 1 }];
  }
  get componentProducts() {
    return this.products.filter((p) => p.kind !== "kit");
  }
  get kitPreview() {
    const e = this.editing;
    if (e?.kind !== "kit" || !e.components?.length) return null;
    try {
      let base = new Decimal(0),
        maxBase = new Decimal(0);
      for (const c of e.components) {
        const p = c.variant_group
          ? this.componentProducts
              .filter((p) => p.variant_group === c.variant_group)
              .sort((a, b) =>
                new Decimal(a.selling_price).cmp(b.selling_price),
              )[0]
          : this.componentProducts.find((p) => p.id === Number(c.product_id));
        const quantity = Number(c.quantity);
        if (
          !p ||
          !Number.isInteger(quantity) ||
          quantity < 1 ||
          quantity > 1000
        )
          return null;
        base = base.plus(new Decimal(p.selling_price).mul(quantity));
        const max = c.variant_group
          ? Decimal.max(
              ...this.componentProducts
                .filter((v) => v.variant_group === c.variant_group)
                .map((v) => new Decimal(v.selling_price)),
            )
          : new Decimal(p.selling_price);
        maxBase = maxBase.plus(max.mul(quantity));
      }
      if (e.kit_pricing_mode === "final") {
        if (e.selling_price === "" || e.selling_price == null) return null;
        const final = new Decimal(e.selling_price);
        if (!final.isFinite() || final.lt(0) || final.gt("1e15")) return null;
      }
      const discount = new Decimal(e.kit_discount_percent ?? "0");
      if (
        !discount.isFinite() ||
        discount.lt(0) ||
        discount.gt(100) ||
        discount.decimalPlaces() > 8
      )
        return null;
      const sale = base
        .mul(new Decimal(1).minus(discount.div(100)))
        .div(100)
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
        .mul(100);
      const maxPrice = maxBase
        .mul(new Decimal(1).minus(discount.div(100)))
        .div(100)
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
        .mul(100);
      return {
        base: base.toString(),
        price:
          e.kit_pricing_mode === "final"
            ? new Decimal(e.selling_price)
                .div(100)
                .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
                .mul(100)
                .toString()
            : sale.toString(),
        maxBase: maxBase.toString(),
        maxPrice:
          e.kit_pricing_mode === "final"
            ? new Decimal(e.selling_price)
                .div(100)
                .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
                .mul(100)
                .toString()
            : maxPrice.toString(),
      };
    } catch {
      return null;
    }
  }
  discountLabel(value: string) {
    return (
      new Decimal(value).toDecimalPlaces(2).toString().replace(".", ",") + "%"
    );
  }
  componentName(id: any) {
    return (
      this.products.find((p) => p.id === Number(id))?.name ||
      "Elegí un producto"
    );
  }
  imageReading = false;
  async chooseProductImage(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const editing = this.editing;
    this.error = "";
    if (
      !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(
        file.type,
      ) ||
      file.size > 5 * 1024 * 1024
    ) {
      this.error = "Elegí una imagen JPG, PNG, GIF o WebP de hasta 5 MB";
      input.value = "";
      return;
    }
    this.imageReading = true;
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
        reader.readAsDataURL(file);
      });
      if (this.editing === editing) {
        editing.image_data = data;
        editing.image_preview = data;
      }
    } catch (e) {
      this.fail(e);
    } finally {
      this.imageReading = false;
      this.cdr.markForCheck();
    }
  }
  async saveProduct() {
    if (this.imageReading) return;
    this.busy = true;
    this.error = "";
    try {
      const e = this.editing;
      await this.api(
        e.id ? "PUT" : "POST",
        "products" + (e.id ? "/" + e.id : ""),
        {
          image_data: e.image_data,
          minimum_stock: e.minimum_stock ?? null,
          name: e.name,
          code: e.code,
          barcode: e.barcode,
          selling_price: String(e.selling_price),
          kit_discount_percent: String(e.kit_discount_percent ?? "0"),
          kit_pricing_mode: e.kit_pricing_mode || "final",
          preferred_provider_id: e.preferred_provider_id,
          source_item_id: e.source?.id,
          source_units: this.quickUnits,
          kind: e.kind || "product",
          variant_group: e.variant_group || null,
          components: e.components,
        },
      );
      this.editing = null;
      this.products = await this.api("GET", "products");
      if (this.view === "catalog") await this.loadCatalog();
      this.toast("Producto guardado.");
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  async remove() {
    this.busy = true;
    try {
      await this.api("DELETE", "products/" + this.deleting.id);
      this.deleting = null;
      this.products = await this.api("GET", "products");
      this.toast("Producto eliminado de tu lista.");
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  @HostListener("document:keydown.escape") closeModal() {
    if (!this.busy) {
      this.cancelPriceEdit();
      this.editing = null;
      this.linking = null;
      this.deleting = null;
      this.stocking = null;
    }
  }
  stockSelections: any[] = [];
  pricingModeOptions = [
    { value: "final", label: "Precio final" },
    { value: "discount", label: "Descuento %" },
  ];
  get providerSelectOptions() {
    return this.facets.providers.map((p: any) => ({
      value: p.id,
      label: p.name,
    }));
  }
  get variantSelectOptions() {
    return this.variantGroups.map((group) => ({ value: group, label: group }));
  }
  get componentSelectOptions() {
    return [
      ...this.variantGroups.map((group) => ({
        value: "g:" + group,
        label: group,
        detail: "Elegir sabor al vender",
      })),
      ...this.componentProducts.map((p) => ({
        value: "p:" + p.id,
        label: p.name,
        detail: "Sabor fijo",
      })),
    ];
  }
  get preferredProviderOptions() {
    return (this.editing?.offers || []).map((o: any) => ({
      value: o.provider_id,
      label: o.provider_name,
    }));
  }
  get variantGroups() {
    return [
      ...new Set(
        this.componentProducts.map((p) => p.variant_group).filter(Boolean),
      ),
    ].sort();
  }
  componentChoice(c: any) {
    return c.variant_group
      ? "g:" + c.variant_group
      : c.product_id
        ? "p:" + c.product_id
        : "";
  }
  chooseComponent(c: any, value: string) {
    c.variant_group = value.startsWith("g:") ? value.slice(2) : null;
    c.product_id = value.startsWith("p:") ? Number(value.slice(2)) : "";
  }
  variantsFor(component: any) {
    return component.variants || [];
  }
  selectionsFor(component: any) {
    return this.stockSelections.filter(
      (s) => s.component_product_id === component.product_id,
    );
  }
  addFlavor(component: any) {
    this.stockSelections.push({
      component_product_id: component.product_id,
      product_id: "",
      quantity: 1,
    });
  }
  removeFlavor(selection: any) {
    this.stockSelections = this.stockSelections.filter((s) => s !== selection);
  }
  get selectedKitPricing() {
    if (this.stocking?.kind !== "kit") return null;
    const parts: any[] = [];
    for (const c of this.stocking.components) {
      if (!c.variant_group) {
        parts.push(c);
        continue;
      }
      const chosen = this.selectionsFor(c);
      if (
        chosen.reduce((sum, s) => sum + Number(s.quantity || 0), 0) !==
        c.quantity
      )
        return null;
      for (const s of chosen) {
        const v = c.variants.find((v: any) => v.id === Number(s.product_id));
        if (
          !v ||
          !Number.isInteger(Number(s.quantity)) ||
          Number(s.quantity) < 1
        )
          return null;
        parts.push({ ...v, quantity: Number(s.quantity) });
      }
    }
    const base = parts.reduce(
      (sum, p) => sum.plus(new Decimal(p.selling_price).mul(p.quantity)),
      new Decimal(0),
    );
    const price =
      this.stocking.kit_pricing_mode === "final"
        ? new Decimal(this.stocking.selling_price)
        : base
            .mul(
              new Decimal(1).minus(
                new Decimal(this.stocking.kit_discount_percent).div(100),
              ),
            )
            .div(100)
            .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
            .mul(100);
    const cost = parts.some((p) => p.costArs == null)
      ? null
      : parts.reduce(
          (sum, p) => sum.plus(new Decimal(p.costArs).mul(p.quantity)),
          new Decimal(0),
        );
    return { price: price.toString(), cost: cost?.toString() ?? null };
  }
  productsById(id: number) {
    return this.products.find((p) => p.id === id);
  }
  openStock(p: any) {
    if (!p || p.kind === "kit") return;
    this.error = "";
    this.stocking = p;
    this.stockAmount = p.own_stock ?? "";
  }
  get stockPreview(): number | null {
    if (
      !this.stocking ||
      this.stocking.kind === "kit" ||
      this.stockAmount === "" ||
      this.stockAmount == null
    )
      return null;
    const text = String(this.stockAmount);
    if (!/^\d+$/.test(text)) return null;
    const n = Number(text);
    return Number.isSafeInteger(n) && n >= 0 && n <= 1000000000 ? n : null;
  }
  async saveStock() {
    if (this.busy || this.stockPreview == null) return;
    this.busy = true;
    this.error = "";
    try {
      await this.api("PUT", `products/${this.stocking.id}/stock`, {
        quantity: this.stockPreview,
      });
      this.products = await this.api("GET", "products");
      this.stocking = null;
      this.page = Math.min(this.page, this.pages);
      this.toast("Stock real actualizado.");
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  movementLabel(m: any) {
    return m.kit_name
      ? "Salida de kit"
      : m.type === "set"
        ? m.previous_stock == null
          ? "Carga inicial"
          : "Ajuste de stock"
        : m.type === "entry"
          ? "Entrada"
          : "Salida";
  }
  openLinks(p: any) {
    this.error = "";
    this.linking = p;
    this.linkProvider = String(
      p.preferred_provider_id || this.facets.providers[0]?.id || 1,
    );
    this.switchProvider();
  }
  switchProvider() {
    const l = this.linking?.offers.find(
      (o: any) => o.provider_id === Number(this.linkProvider),
    );
    this.individual = l?.individual || null;
    this.kit = l?.kit || null;
    this.kitUnits = l?.kit_units || 1;
    this.packUnits = l?.individual_units || 1;
    this.confirmPack = false;
    this.linkSearch = this.linking?.name || "";
    this.confirmPresentation = false;
    this.tab = "individual";
    this.confirmSame = false;
    void this.searchLinks();
  }
  async searchLinks() {
    const seq = ++this.linkSequence;
    try {
      let params = new HttpParams()
        .set("provider", this.linkProvider)
        .set("search", this.linkSearch)
        .set("size", 100)
        .set("kind", this.tab);
      const result: any = await firstValueFrom(
        this.http.get("/api/catalog", { params }),
      );
      if (seq === this.linkSequence) this.linkResults = result.items;
    } catch (e) {
      this.fail(e);
    } finally {
      this.cdr.markForCheck();
    }
  }
  setTab(v: string) {
    this.tab = v;
    void this.searchLinks();
  }
  choose(item: any) {
    this.confirmPresentation = false;
    if (this.tab === "kit") {
      this.kit = item;
      this.kitUnits = this.suggestedUnits(item);
    } else {
      this.individual = item;
      this.packUnits = 1;
      this.confirmPack = false;
    }
    this.confirmSame = false;
  }
  async saveLinks() {
    this.busy = true;
    try {
      await this.api("PUT", "products/" + this.linking.id + "/links", {
        provider_id: Number(this.linkProvider),
        individual_item_id: this.individual?.id || null,
        kit_item_id: this.kit?.id || null,
        kit_units: this.kitUnits,
        matches_confirmed: this.confirmSame,
        presentation_confirmed: this.confirmPresentation,
        individual_units: this.packUnits,
        pack_confirmed: this.confirmPack,
      });
      this.linking = null;
      this.products = await this.api("GET", "products");
      this.toast("Ofertas vinculadas.");
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  async unlink() {
    this.busy = true;
    try {
      await this.api(
        "DELETE",
        `products/${this.linking.id}/links/${this.linkProvider}`,
      );
      this.linking = null;
      this.products = await this.api("GET", "products");
      this.toast("Vínculo eliminado.");
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  async saveRate() {
    this.busy = true;
    try {
      this.settings = await this.api("PUT", "settings", {
        usd_ars: this.rate || null,
      });
      this.products = await this.api("GET", "products");
      this.toast("Tipo de cambio guardado.");
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  async saveQuoteMarkup() {
    this.busy = true;
    try {
      this.settings = await this.api("PUT", "settings", { supplier_quote_markup_percent: this.quoteDefaultMarkup });
      this.quoteDefaultMarkup = this.settings.supplier_quote_markup_percent;
      if(!this.quoteState.items.length) this.quoteState.markup = this.quoteDefaultMarkup;
      this.toast("Recargo predeterminado guardado.");
    } catch(e) { this.fail(e); }
    finally { this.busy = false; this.cdr.markForCheck(); }
  }
}
