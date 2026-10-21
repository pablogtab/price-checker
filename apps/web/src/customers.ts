import {
  Component,
  HostListener,
  inject,
  ChangeDetectorRef,
  OnInit,
  OnDestroy,
  Output,
  EventEmitter,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { A11yModule } from "@angular/cdk/a11y";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import Decimal from "decimal.js";
import { ButtonDirective } from "./ui/button";
import { SelectComponent } from "./select";
import { CustomerEditorComponent } from "./customer-editor";
@Component({
  selector: "app-customers",
  standalone: true,
  imports: [
    FormsModule,
    A11yModule,
    ButtonDirective,
    SelectComponent,
    CustomerEditorComponent,
  ],
  template: `
    <div class="customers-page">
      @if (editor) {
        <app-customer-editor
          [customer]="editing"
          (closed)="editor = false"
          (saved)="customerSaved()"
        />
      }
      @if (error) {
        <p class="alert danger" role="alert">
          {{ error }} <button appButton (click)="load()">Reintentar</button>
        </p>
      }
      @if (notice) {
        <p class="purchase-notice" role="status">{{ notice }}</p>
      }
      @if (loading) {
        <p class="customers-loading" role="status">Cargando clientes…</p>
      }
      @if (id) {
        <a class="customers-back" [href]="backUrl" (click)="back($event)"
          >← Volver a clientes</a
        >
      }
      @if (!id) {
        <header class="customers-heading">
          <div>
            <h2>Gestión de clientes</h2>
            <p>Contactos, compras y cuentas corrientes.</p>
          </div>
          <button appButton="primary" (click)="edit(null)">
            + Nuevo cliente
          </button>
        </header>
        <div class="customers-metrics" aria-label="Resumen general de clientes">
          <article>
            <span>Clientes</span
            ><strong>{{ list.summary?.customers || 0 }}</strong>
          </article>
          <article>
            <span>Con saldo pendiente</span
            ><strong>{{ list.summary?.debtors || 0 }}</strong>
          </article>
          <article>
            <span>Total por cobrar · ARS</span
            ><strong>{{ money(list.summary?.receivable) }}</strong>
          </article>
        </div>
        <section class="catalog-panel customers-panel">
          <div class="customers-toolbar">
            <label class="customers-search"
              >Buscar cliente<input
                type="search"
                placeholder="Nombre, teléfono o Instagram…"
                [ngModel]="search"
                (ngModelChange)="searchChanged($event)"
            /></label>
            <label
              >Cuenta corriente<app-select
                label="Estado de cuenta"
                [options]="statuses"
                [(ngModel)]="status"
                (ngModelChange)="filterChanged()"
            /></label>
            <button appButton="ghost" (click)="clear()">Limpiar</button>
          </div>
          <div class="customers-mobile-sort">
            <label
              >Ordenar por<app-select
                label="Ordenar clientes por"
                [options]="sortOptions"
                [(ngModel)]="sort"
                (ngModelChange)="mobileSortChanged()" /></label
            ><button
              appButton
              [attr.aria-label]="
                direction === 'asc'
                  ? 'Cambiar a descendente'
                  : 'Cambiar a ascendente'
              "
              (click)="order(sort)"
            >
              {{ direction === "asc" ? "↑" : "↓" }}
            </button>
          </div>
          <div class="customers-table-scroll">
            <table class="customers-table">
              <thead>
                <tr>
                  @for (col of columns; track col.key) {
                    <th
                      [attr.aria-sort]="
                        sort === col.key
                          ? direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      "
                    >
                      <button (click)="order(col.key)">
                        {{ col.label }}
                        <span aria-hidden="true">{{
                          sort === col.key
                            ? direction === "asc"
                              ? "↑"
                              : "↓"
                            : "↕"
                        }}</span>
                      </button>
                    </th>
                  }
                  <th>Contacto</th>
                  <th><span class="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                @for (c of list.items; track c.id) {
                  <tr>
                    <td data-label="Cliente">
                      <a
                        class="customers-name"
                        [href]="detailUrl(c.id)"
                        (click)="open($event, c.id)"
                        >{{ c.name }}</a
                      ><span
                        class="customers-status"
                        [class.has-debt]="positive(c.balance)"
                        >{{
                          positive(c.balance)
                            ? "Con deuda"
                            : c.sale_count
                              ? "Al día"
                              : "Sin ventas"
                        }}</span
                      >
                    </td>
                    <td data-label="Última compra">{{ date(c.last_sale) }}</td>
                    <td data-label="Ventas">{{ c.sale_count }}</td>
                    <td data-label="Total comprado">{{ money(c.sold) }}</td>
                    <td data-label="Pendiente">
                      <strong [class.customers-debt]="positive(c.balance)">{{
                        money(c.balance)
                      }}</strong>
                    </td>
                    <td data-label="Contacto">
                      <div class="customers-contact">
                        @if (c.phone) {
                          <a [href]="phoneUrl(c.phone)">{{ c.phone }}</a>
                        }
                        @if (c.instagram) {
                          @if (instagramUrl(c.instagram)) {
                            <a
                              [href]="instagramUrl(c.instagram)"
                              target="_blank"
                              rel="noopener noreferrer"
                              >{{ c.instagram }}</a
                            >
                          } @else {
                            <span>{{ c.instagram }}</span>
                          }
                        }
                        @if (!c.phone && !c.instagram) {
                          <span>Sin contacto</span>
                        }
                      </div>
                    </td>
                    <td class="customers-actions">
                      <button appButton="ghost" (click)="go(c.id)">
                        Ver ficha</button
                      ><button appButton="ghost" (click)="edit(c)">
                        Editar
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (!list.items?.length && !loading) {
            <div class="customers-empty">
              <h3>
                {{
                  search || status !== "all"
                    ? "Sin coincidencias"
                    : "Todavía no hay clientes"
                }}
              </h3>
              <p>
                {{
                  search || status !== "all"
                    ? "Probá con otro nombre o cambiá los filtros."
                    : "Agregá tu primer cliente para registrar sus compras y cobros."
                }}
              </p>
            </div>
          }
          <footer class="customers-pagination">
            <span
              >{{ list.total || 0 }} clientes · página {{ page }} de
              {{ pages(list.total) }}</span
            >
            <div>
              <button
                appButton
                [disabled]="page <= 1 || loading"
                (click)="changePage(-1)"
              >
                Anterior</button
              ><button
                appButton
                [disabled]="page >= pages(list.total) || loading"
                (click)="changePage(1)"
              >
                Siguiente
              </button>
            </div>
          </footer>
        </section>
      } @else if (customer) {
        <header class="customers-heading">
          <div>
            <h2>{{ customer.name }}</h2>
            <div class="customers-contact">
              @if (customer.phone) {
                <a [href]="phoneUrl(customer.phone)">{{ customer.phone }}</a>
              }
              @if (customer.instagram) {
                @if (instagramUrl(customer.instagram)) {
                  <a
                    [href]="instagramUrl(customer.instagram)"
                    target="_blank"
                    rel="noopener noreferrer"
                    >{{ customer.instagram }}</a
                  >
                } @else {
                  <span>{{ customer.instagram }}</span>
                }
              }
            </div>
            <p>{{ customer.note || "Sin notas" }}</p>
          </div>
          <div class="customers-actions">
            <button appButton (click)="edit(customer)">Editar cliente</button
            ><button
              appButton="primary"
              [disabled]="!positive(customer.balance)"
              (click)="startPayment()"
            >
              Registrar cobro
            </button>
          </div>
        </header>
        <div class="customers-metrics">
          <article>
            <span>Total comprado · {{ customer.sale_count }} ventas</span
            ><strong>{{ money(customer.sold) }}</strong
            ><small>Última compra: {{ date(customer.last_sale) }}</small>
          </article>
          <article>
            <span>Total cobrado</span
            ><strong>{{ money(customer.paid) }}</strong>
          </article>
          <article>
            <span>Saldo pendiente · ARS</span
            ><strong [class.customers-debt]="positive(customer.balance)">{{
              money(customer.balance)
            }}</strong
            ><small>{{
              positive(customer.balance) ? "Con deuda" : "Al día"
            }}</small>
          </article>
        </div>
        <section class="catalog-panel customers-panel">
          <nav class="customers-tabs" aria-label="Historial del cliente">
            <button
              appButton
              [class.active]="tab === 'ledger'"
              [attr.aria-pressed]="tab === 'ledger'"
              (click)="setTab('ledger')"
            >
              Cuenta corriente</button
            ><button
              appButton
              [class.active]="tab === 'sales'"
              [attr.aria-pressed]="tab === 'sales'"
              (click)="setTab('sales')"
            >
              Ventas
            </button>
          </nav>
          @if (tab === "ledger") {
            <div class="customers-table-scroll">
              <table class="customers-table ledger-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Concepto</th>
                    <th>Cargo</th>
                    <th>Cobro</th>
                    <th>Saldo acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  @for (e of history.items; track e.kind + e.id) {
                    <tr>
                      <td data-label="Fecha">{{ date(e.occurred_on) }}</td>
                      <td data-label="Concepto">{{ e.concept }}</td>
                      <td data-label="Cargo">
                        {{ positive(e.debit) ? money(e.debit) : "—" }}
                      </td>
                      <td data-label="Cobro">
                        {{ positive(e.credit) ? money(e.credit) : "—" }}
                      </td>
                      <td data-label="Saldo acumulado">
                        <strong>{{ money(e.balance) }}</strong>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="customers-sale-list">
              @for (s of history.items; track s.id) {
                <details>
                  <summary>
                    <span>Venta #{{ s.id }} · {{ date(s.sold_on) }}</span
                    >@if(s.status === "annulled"){<span>Anulada</span>}<strong>{{ money(s.total) }}</strong
                    ><span>Pendiente: {{ money(s.pending) }}</span>
                  </summary>
                  <div class="customers-sale-content">
                    @for (i of s.items; track i.id) {
                      <p>
                        {{ i.quantity }} × {{ i.product_name }}
                        <strong>{{ money(i.total) }}</strong>
                      </p>
                      @for (p of i.components; track p.id) {
                        <small>{{ p.quantity }} × {{ p.product_name }}</small>
                      }
                    }
                    @if (s.note) {
                      <p>{{ s.note }}</p>
                    }
                    <h4>Cobros</h4>
                    @for (p of s.payments; track p.id) {
                      <p>
                        {{ date(p.occurred_on) }} · {{ p.account_name }}
                        <strong>{{ money(p.amount) }}</strong>
                      </p>
                    } @empty {
                      <p>Sin cobros registrados.</p>
                    }
                  </div>
                </details>
              }
            </div>
          }
          @if (!history.items?.length && !loading) {
            <div class="customers-empty">
              <h3>Sin movimientos</h3>
              <p>Las ventas y los cobros de este cliente aparecerán acá.</p>
            </div>
          }
          <footer class="customers-pagination">
            <span
              >{{ history.total || 0 }} registros · página {{ historyPage }} de
              {{ pages(history.total) }}</span
            >
            <div>
              <button
                appButton
                [disabled]="historyPage <= 1 || loading"
                (click)="historyMove(-1)"
              >
                Anterior</button
              ><button
                appButton
                [disabled]="historyPage >= pages(history.total) || loading"
                (click)="historyMove(1)"
              >
                Siguiente
              </button>
            </div>
          </footer>
        </section>
      }
      @if (paymentOpen) {
        <div
          class="modal-backdrop"
          (click)="closePayment()"
          (keydown.escape)="closePayment(); $event.stopPropagation()"
        >
          <section
            class="modal customer-payment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-heading"
            cdkTrapFocus
            [cdkTrapFocusAutoCapture]="true"
            (click)="$event.stopPropagation()"
          >
            <button
              class="modal-close"
              aria-label="Cerrar cobro"
              [disabled]="paymentBusy"
              (click)="closePayment()"
            >
              ×
            </button>
            <h2 id="payment-heading">Registrar cobro</h2>
            <p>{{ customer.name }} · pendiente {{ money(customer.balance) }}</p>
            @if (paymentError) {
              <p class="alert danger" role="alert">{{ paymentError }}</p>
            }
            <form (ngSubmit)="preview ? confirmPayment() : previewPayment()">
              <div class="customers-payment-fields">
                <label
                  >Importe ARS<input
                    cdkFocusInitial
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    [(ngModel)]="paymentAmount"
                    (ngModelChange)="invalidatePreview()"
                    [disabled]="paymentBusy" /></label
                ><label
                  >Cuenta<app-select
                    name="account"
                    label="Cuenta de cobro"
                    [options]="accountOptions"
                    [(ngModel)]="paymentAccount"
                    (ngModelChange)="invalidatePreview()"
                    [disabled]="paymentBusy" /></label
                ><label
                  >Fecha<input
                    type="date"
                    name="date"
                    required
                    [(ngModel)]="paymentDate"
                    (ngModelChange)="invalidatePreview()"
                    [disabled]="paymentBusy"
                /></label>
              </div>
              @if (!accountOptions.length) {
                <p class="alert danger">
                  Cargá el saldo inicial de una cuenta en ARS desde Caja para
                  registrar cobros.
                </p>
              }
              @if (preview) {
                <div class="customers-payment-preview">
                  <h3>Distribución del cobro</h3>
                  <p>Se cancelan primero las ventas más antiguas.</p>
                  @for (p of preview.allocations; track p.sale_id) {
                    <div>
                      <span
                        >Venta #{{ p.sale_id }} · {{ date(p.sold_on)
                        }}<small>Queda {{ money(p.remaining) }}</small></span
                      ><strong>{{ money(p.amount) }}</strong>
                    </div>
                  }
                  <p class="customers-preview-total">
                    Saldo después del cobro
                    <strong>{{ money(preview.remaining) }}</strong>
                  </p>
                </div>
              }
              <div class="customers-payment-actions">
                <button
                  type="button"
                  appButton
                  [disabled]="paymentBusy"
                  (click)="closePayment()"
                >
                  Cancelar</button
                ><button
                  appButton="primary"
                  [disabled]="paymentBusy || !validPayment"
                >
                  {{
                    paymentBusy
                      ? "Procesando…"
                      : preview
                        ? "Confirmar cobro"
                        : "Revisar distribución"
                  }}
                </button>
              </div>
            </form>
          </section>
        </div>
      }
    </div>
  `,
  styleUrl: "./customers.css",
})
export class CustomersComponent implements OnInit, OnDestroy {
  @Output() saved = new EventEmitter<void>();
  http = inject(HttpClient);
  cdr = inject(ChangeDetectorRef);
  id: number | null = null;
  search = "";
  status = "all";
  sort = "name";
  direction = "asc";
  page = 1;
  list: any = { items: [] };
  customer: any = null;
  history: any = { items: [] };
  historyPage = 1;
  tab = "ledger";
  backUrl = "/customers";
  loading = false;
  error = "";
  notice = "";
  editor = false;
  editing: any = null;
  accounts: any[] = [];
  paymentOpen = false;
  paymentBusy = false;
  paymentError = "";
  paymentAmount: any = "";
  paymentAccount: any = "";
  paymentDate = "";
  requestKey = "";
  preview: any = null;
  private timer: any;
  private revision = 0;
  private destroyed = false;
  statuses = [
    { value: "all", label: "Todos" },
    { value: "debt", label: "Con deuda" },
    { value: "settled", label: "Al día" },
    { value: "new", label: "Sin ventas" },
  ];
  columns = [
    { key: "name", label: "Cliente" },
    { key: "last_sale", label: "Última compra" },
    { key: "sale_count", label: "Ventas" },
    { key: "sold", label: "Total comprado" },
    { key: "balance", label: "Pendiente" },
  ];
  get sortOptions() {
    return this.columns.map((c) => ({ value: c.key, label: c.label }));
  }
  mobileSortChanged() {
    this.direction = this.sort === "name" ? "asc" : "desc";
    this.filterChanged();
  }
  ngOnInit() {
    this.readRoute();
    void this.load();
  }
  ngOnDestroy() {
    this.destroyed = true;
    this.revision++;
    clearTimeout(this.timer);
  }
  @HostListener("window:popstate") pop() {
    clearTimeout(this.timer);
    this.paymentOpen = false;
    this.editor = false;
    this.readRoute();
    void this.load();
  }
  readRoute() {
    const params = new URLSearchParams(location.search);
    this.id =
      Number(location.pathname.match(/^\/customers\/(\d+)$/)?.[1]) || null;
    this.search = params.get("search") || "";
    this.status = ["all", "debt", "settled", "new"].includes(
      params.get("status") || "",
    )
      ? params.get("status")!
      : "all";
    this.sort = this.columns.some((c) => c.key === params.get("sort"))
      ? params.get("sort")!
      : "name";
    this.direction = params.get("direction") === "desc" ? "desc" : "asc";
    this.page = Math.max(1, Math.floor(Number(params.get("page")) || 1));
    this.backUrl = "/customers" + this.query();
    this.historyPage = 1;
    this.tab = "ledger";
  }
  query() {
    const p = new URLSearchParams();
    if (this.search) p.set("search", this.search);
    if (this.status !== "all") p.set("status", this.status);
    if (this.sort !== "name") p.set("sort", this.sort);
    if (this.direction !== "asc") p.set("direction", this.direction);
    if (this.page > 1) p.set("page", String(this.page));
    return p.size ? "?" + p : "";
  }
  api(method: string, path: string, body?: any): Promise<any> {
    return firstValueFrom(
      this.http.request(
        method,
        "/api/" + path,
        body === undefined ? {} : { body },
      ),
    );
  }
  async load() {
    const rev = ++this.revision;
    this.loading = true;
    this.error = "";
    try {
      if (this.id) {
        const [c, h] = await Promise.all([
          this.api("GET", "customers/" + this.id),
          this.api(
            "GET",
            `customers/${this.id}/${this.tab}?page=${this.historyPage}`,
          ),
        ]);
        if (rev !== this.revision) return;
        this.customer = c;
        this.history = h;
      } else {
        const list = await this.api("GET", "customers/search" + this.query());
        if (rev !== this.revision) return;
        this.list = list;
        if (this.page > this.pages(list.total)) {
          this.page = this.pages(list.total);
          history.replaceState({}, "", "/customers" + this.query());
          void this.load();
        }
      }
    } catch (e: any) {
      if (rev === this.revision) {
        this.error =
          e?.error?.message ||
          "No se pudo cargar la información. Revisá la conexión.";
        this.customer = null;
      }
    } finally {
      if (rev === this.revision && !this.destroyed) {
        this.loading = false;
        this.cdr.markForCheck();
      }
    }
  }
  searchChanged(value: string) {
    this.search = value;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.filterChanged(), 250);
  }
  filterChanged() {
    clearTimeout(this.timer);
    this.page = 1;
    this.updateList();
  }
  updateList() {
    history.replaceState({}, "", "/customers" + this.query());
    void this.load();
  }
  clear() {
    this.search = "";
    this.status = "all";
    this.sort = "name";
    this.direction = "asc";
    this.filterChanged();
  }
  order(key: string) {
    this.direction =
      this.sort === key && this.direction === "asc"
        ? "desc"
        : this.sort === key
          ? "asc"
          : key === "name"
            ? "asc"
            : "desc";
    this.sort = key;
    this.filterChanged();
  }
  changePage(delta: number) {
    this.page += delta;
    this.updateList();
  }
  pages(total: any) {
    return Math.max(1, Math.ceil((total || 0) / 25));
  }
  detailUrl(id: number) {
    return "/customers/" + id + this.query();
  }
  open(event: MouseEvent, id: number) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    this.go(id);
  }
  go(id: number) {
    clearTimeout(this.timer);
    this.backUrl = "/customers" + this.query();
    history.pushState({}, "", this.detailUrl(id));
    this.id = id;
    this.customer = null;
    this.historyPage = 1;
    this.tab = "ledger";
    this.notice = "";
    void this.load();
    window.scrollTo(0, 0);
  }
  back(event: MouseEvent) {
    event.preventDefault();
    history.pushState({}, "", this.backUrl);
    this.readRoute();
    this.notice = "";
    void this.load();
  }
  setTab(tab: string) {
    this.tab = tab;
    this.historyPage = 1;
    this.history = { items: [] };
    void this.load();
  }
  historyMove(delta: number) {
    this.historyPage += delta;
    void this.load();
  }
  edit(c: any) {
    this.editing = c;
    this.editor = true;
  }
  async customerSaved() {
    this.editor = false;
    this.notice = "Cliente guardado.";
    await this.load();
    this.saved.emit();
  }
  money(value: any) {
    return value == null
      ? "—"
      : new Decimal(value).toNumber().toLocaleString("es-AR", {
          style: "currency",
          currency: "ARS",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  }
  positive(value: any) {
    return value != null && new Decimal(value).gt(0);
  }
  date(value: any) {
    if (!value) return "—";
    const [y, m, d] = String(value).slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  phoneUrl(value: string) {
    return "tel:" + value.replace(/[^\d+]/g, "");
  }
  instagramUrl(value: string) {
    const name = value
      .trim()
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
      .replace(/^@/, "")
      .replace(/\/$/, "");
    return /^[a-z0-9._]{1,30}$/i.test(name)
      ? "https://www.instagram.com/" + name + "/"
      : null;
  }
  get accountOptions() {
    return this.accounts
      .filter((a) => a.currency === "ARS" && a.opening_balance != null)
      .map((a) => ({ value: a.id, label: a.name }));
  }
  async startPayment() {
    this.paymentError = "";
    this.preview = null;
    this.requestKey = crypto.randomUUID();
    this.paymentAmount = this.customer.balance;
    this.paymentDate = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    try {
      this.accounts = await this.api("GET", "cash/accounts");
      this.paymentAccount =
        this.accountOptions.find(
          (a) => a.label.toLowerCase() === "transferencia",
        )?.value ||
        this.accountOptions[0]?.value ||
        "";
      this.paymentOpen = true;
    } catch (e: any) {
      this.error = e?.error?.message || "No se pudieron cargar las cuentas.";
    }
    this.cdr.markForCheck();
  }
  closePayment() {
    if (!this.paymentBusy) this.paymentOpen = false;
  }
  invalidatePreview() {
    this.preview = null;
    this.requestKey = crypto.randomUUID();
  }
  get validPayment() {
    try {
      const v = new Decimal(this.paymentAmount);
      return (
        v.gt(0) &&
        v.lte(this.customer.balance) &&
        v.decimalPlaces() <= 2 &&
        !!this.paymentDate &&
        this.accountOptions.some((a) => a.value === this.paymentAccount)
      );
    } catch {
      return false;
    }
  }
  async previewPayment() {
    if (this.paymentBusy || !this.validPayment) return;
    this.paymentBusy = true;
    this.paymentError = "";
    try {
      this.preview = await this.api(
        "POST",
        `customers/${this.id}/payments/preview`,
        { amount: String(this.paymentAmount) },
      );
    } catch (e: any) {
      this.paymentError = e?.error?.message || "No se pudo preparar el cobro.";
    } finally {
      this.paymentBusy = false;
      this.cdr.markForCheck();
    }
  }
  async confirmPayment() {
    if (this.paymentBusy || !this.preview || !this.validPayment) return;
    this.paymentBusy = true;
    this.paymentError = "";
    try {
      await this.api("POST", `customers/${this.id}/payments`, {
        amount: String(this.paymentAmount),
        account_id: this.paymentAccount,
        occurred_on: this.paymentDate,
        request_key: this.requestKey,
        preview_token: this.preview.token,
      });
      this.paymentOpen = false;
      this.notice = "Cobro registrado en la cuenta y aplicado a las ventas.";
      await this.load();
      this.saved.emit();
    } catch (e: any) {
      this.paymentError =
        e?.error?.message ||
        "No se pudo registrar el cobro. Podés reintentar sin duplicarlo.";
      if (e.status === 409) {
        this.preview = null;
        await this.load();
        try {
          this.preview = await this.api(
            "POST",
            `customers/${this.id}/payments/preview`,
            { amount: String(this.paymentAmount) },
          );
        } catch {
          this.paymentError =
            "El saldo cambió. Corregí el importe y revisá nuevamente la distribución.";
        }
      }
    } finally {
      this.paymentBusy = false;
      this.cdr.markForCheck();
    }
  }
}
