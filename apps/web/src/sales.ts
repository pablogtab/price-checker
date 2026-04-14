import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  ChangeDetectorRef,
  OnInit,
} from "@angular/core";
import { A11yModule } from "@angular/cdk/a11y";
import { FormsModule } from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import Decimal from "decimal.js";
import { SelectComponent } from "./select";

@Component({
  selector: "app-sales",
  standalone: true,
  imports: [FormsModule, SelectComponent, A11yModule],
  template: ` <div class="purchase-page">
    @if (clientForm) {
      <div
        class="modal-backdrop"
        (click)="!clientBusy && cancelClient()"
        (keydown.escape)="
          !clientBusy && cancelClient(); $event.stopPropagation()
        "
      >
        <section
          class="modal customer-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="customer-dialog-title"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
          (click)="$event.stopPropagation()"
        >
          <button
            type="button"
            class="modal-close"
            aria-label="Cerrar cliente"
            [disabled]="clientBusy"
            (click)="cancelClient()"
          >
            ×
          </button>
          <div class="purchase-heading">
            <div>
              <h2 id="customer-dialog-title">
                {{ editingClient ? "Editar cliente" : "Nuevo cliente" }}
              </h2>
              <p>Solo los datos que necesitás para identificarlo.</p>
            </div>
          </div>
          <form (ngSubmit)="saveClient()" class="cash-form">
            <label
              >Nombre<input
                cdkFocusInitial
                name="clientName"
                maxlength="100"
                required
                [(ngModel)]="clientName"
                placeholder="Nombre y apellido"
            /></label>
            <label
              >Teléfono <span class="optional">opcional</span
              ><input
                name="clientPhone"
                maxlength="100"
                [(ngModel)]="clientPhone"
                type="tel"
            /></label>
            <label class="cash-wide"
              >Instagram <span class="optional">opcional</span
              ><input
                name="clientInstagram"
                maxlength="100"
                [(ngModel)]="clientInstagram"
                placeholder="@usuario"
                autocomplete="off"
            /></label>
            <label class="cash-wide"
              >Nota <span class="optional">opcional</span
              ><input
                name="clientNote"
                maxlength="500"
                [(ngModel)]="clientNote"
            /></label>
            <div class="sales-actions cash-wide">
              <button
                class="purchase-save"
                [disabled]="clientBusy || !clientName.trim()"
              >
                {{
                  clientBusy
                    ? "Guardando…"
                    : editingClient
                      ? "Guardar cliente"
                      : "Crear cliente"
                }}
              </button>
              <button
                type="button"
                class="text-button"
                [disabled]="clientBusy"
                (click)="cancelClient()"
              >
                Cancelar
              </button>
            </div>
          </form>
          @if (clientError) {
            <p class="alert danger" role="alert">{{ clientError }}</p>
          }
        </section>
      </div>
    }
    @if (error) {
      <p class="alert danger" role="alert">{{ error }}</p>
    }
    @if (notice) {
      <p class="purchase-notice" role="status">{{ notice }}</p>
    }
    @if (mode === "customers") {
      <section class="catalog-panel purchase-panel">
        <div class="purchase-heading">
          <div>
            <h2>Clientes</h2>
            <p>El saldo indica cuánto queda por cobrar.</p>
          </div>
          <div class="sales-client-tools">
            <button type="button" class="purchase-add" (click)="newClient()">
              + Nuevo cliente
            </button>
            <input
              class="sales-client-search"
              type="search"
              aria-label="Buscar cliente"
              placeholder="Buscar nombre, teléfono o Instagram…"
              [(ngModel)]="clientSearch"
            />
          </div>
        </div>
        <div class="client-list">
          @for (c of filteredClients; track c.id) {
            <article
              class="client-card"
              [class.client-selected]="selectedClient?.id === c.id"
            >
              <div>
                <strong>{{ c.name }}</strong
                ><small
                  >{{ c.phone || "Sin teléfono" }}
                  @if (c.instagram) {
                    · {{ c.instagram }}
                  }
                </small>
              </div>
              <div class="client-balance">
                <span>Pendiente</span><strong>{{ amount(c.balance) }}</strong>
              </div>
              <div class="sales-actions">
                <button class="purchase-add" (click)="openClient(c)">
                  Cuenta corriente</button
                ><button class="text-button" (click)="editClient(c)">
                  Editar
                </button>
              </div>
            </article>
          } @empty {
            <p class="purchase-empty">
              {{
                clientSearch
                  ? "No hay coincidencias."
                  : "Todavía no cargaste clientes."
              }}
            </p>
          }
        </div>
      </section>
      @if (selectedClient) {
        <section class="catalog-panel purchase-panel">
          <div class="purchase-heading">
            <div>
              <h2>{{ selectedClient.name }}</h2>
              <p>
                {{ selectedClient.phone }}
                @if (selectedClient.instagram) {
                  · {{ selectedClient.instagram }}
                }
                {{ selectedClient.note }}
              </p>
            </div>
            <div class="sales-balance">
              <span>Saldo pendiente · ARS</span
              ><strong>{{ amount(currentClientBalance) }}</strong>
            </div>
          </div>
          <h3>Cuenta corriente</h3>
          <p class="purchase-help">
            Últimas 100 ventas y sus cobros. El saldo incluye todo el historial.
          </p>
          <div class="ledger-list">
            @for (entry of clientLedger; track entry.key) {
              <div class="ledger-row">
                <span
                  >{{ entry.date }}<small>{{ entry.label }}</small></span
                ><span
                  >{{ entry.debit ? "Venta" : "Cobro"
                  }}<strong>{{ amount(entry.value) }}</strong></span
                >
              </div>
            } @empty {
              <p class="purchase-empty">
                Este cliente todavía no tiene ventas.
              </p>
            }
          </div>
        </section>
      }
    } @else {
      <section class="catalog-panel purchase-panel">
        <div class="purchase-heading">
          <div>
            <h2>Nueva venta</h2>
            <p>Elegí productos y sabores. Al guardar se descuenta el stock.</p>
          </div>
          <span class="purchase-badge">ARS</span>
        </div>
        <div class="sales-fields">
          <label
            >Cliente<app-select
              label="Cliente"
              placeholder="Consumidor final"
              [clearable]="true"
              [options]="clientOptions"
              [(ngModel)]="customer"
            />
            <div class="sales-customer-actions">
              <button
                type="button"
                aria-label="Nuevo cliente"
                class="sales-new-client"
                (click)="newClient()"
              >
                + Nuevo cliente
              </button>
              @if (chosenCustomer; as c) {
                <button
                  type="button"
                  class="sales-new-client"
                  aria-label="Editar cliente"
                  (click)="editClient(c)"
                >
                  ✎ Editar cliente
                </button>
              }
            </div></label
          >
          <label
            >Fecha de venta<input type="date" [(ngModel)]="soldOn"
          /></label>
          <label
            >Nota <span class="optional">opcional</span
            ><input maxlength="500" [(ngModel)]="note"
          /></label>
        </div>
        <div class="purchase-section-heading">
          <h3>Productos vendidos</h3>
          <span>{{ lines.length }} productos</span>
        </div>
        <div class="sales-table">
          <div class="sales-table-header">
            <span>Producto / promo</span><span>Cantidad</span
            ><span>Precio unitario</span><span>Subtotal</span><span></span>
          </div>
          @for (line of lines; track line; let i = $index) {
            <div class="sales-line">
              @if (selected(line)?.components?.length && line.quantity > 100) {
                <p class="sales-line-warning">
                  Podés cargar hasta 100 promos por venta.
                </p>
              }
              <label class="sales-product"
                ><span class="sales-field-label">Producto / promo</span
                ><app-select
                  label="Producto vendido"
                  placeholder="Buscar producto o promo…"
                  [options]="productOptions"
                  [(ngModel)]="line.product_id"
                  (ngModelChange)="choose(line)"
                />
                @if (selected(line); as p) {
                  <small>{{
                    p.kind === "kit"
                      ? "Stock según los sabores elegidos"
                      : "Stock actual: " + (p.own_stock ?? "Sin cargar")
                  }}</small>
                }
              </label>
              <label
                ><span class="sales-field-label">Cantidad</span
                ><input
                  type="number"
                  min="1"
                  step="1"
                  [(ngModel)]="line.quantity"
                  (ngModelChange)="syncSlots(line)"
              /></label>
              <label
                ><span class="sales-field-label">Precio unitario (ARS)</span
                ><input
                  type="number"
                  min="0"
                  step="0.01"
                  aria-label="Precio unitario (ARS)"
                  [(ngModel)]="line.unit_price"
                  (ngModelChange)="line.priceEdited = true"
                />
                <span>Descuento de venta (%)</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  aria-label="Descuento de venta (%)"
                  [(ngModel)]="line.discount"
                />
              </label>
              <div class="sales-subtotal">
                <span class="sales-field-label">Subtotal</span
                ><strong>{{ lineAmount(line) }}</strong>
              </div>
              <button
                class="purchase-remove"
                aria-label="Quitar producto vendido"
                (click)="lines.splice(i, 1)"
                [disabled]="lines.length === 1"
              >
                ×
              </button>
              @if (line.slots.length) {
                <div class="sales-flavors">
                  <p>Elegí los sabores de cada promo por separado.</p>
                  @for (promo of promoIndexes(line); track promo) {
                    <section class="sales-promo-group">
                      <h4>
                        Promo {{ promo + 1 }}
                        <small>{{ amount(promoPrice(line, promo)) }}</small>
                      </h4>
                      <div class="sales-promo-options">
                        @for (
                          slot of slotsForPromo(line, promo);
                          track slot.key
                        ) {
                          <label
                            >{{ slot.label
                            }}<app-select
                              [label]="
                                'Promo ' + (promo + 1) + ' · ' + slot.label
                              "
                              placeholder="Elegir sabor"
                              [options]="slot.options"
                              [(ngModel)]="slot.product_id"
                              (ngModelChange)="updateKitPrice(line)"
                            />
                          </label>
                        }
                      </div>
                    </section>
                  }
                </div>
              }
            </div>
          }
        </div>
        <button class="purchase-add" (click)="add()">+ Agregar producto</button>
        @if (stockPreview.length) {
          <section
            class="sales-stock-preview"
            aria-label="Stock actual y después de la venta"
          >
            <h3>Stock de los productos elegidos</h3>
            <div class="sales-stock-heading">
              <span>Producto / sabor</span><span>Actual</span
              ><span>Después</span>
            </div>
            @for (p of stockPreview; track p.id) {
              <div
                class="sales-stock-row"
                [class.stock-negative]="p.after !== null && p.after < 0"
              >
                <span>{{ p.name }}</span
                ><strong>{{ p.stock ?? "Sin cargar" }}</strong
                ><strong>{{ p.after ?? "—" }}</strong>
              </div>
            }
            @if (hasNegativeStock) {
              <p class="stock-warning" role="status">
                Esta venta dejará stock negativo en los productos marcados.
                Podés registrarla igualmente.
              </p>
            }
          </section>
        }
        <div class="sales-payment">
          <h3>Cobro de la venta</h3>
          <div class="cash-form">
            <label
              >Forma de registro<app-select
                label="Cobro de la venta"
                [options]="paymentModes"
                [(ngModel)]="paymentMode"
            /></label>
            @if (paymentMode === "now") {
              <label
                >Cuenta<app-select
                  label="Cuenta para el cobro"
                  placeholder="Elegir cuenta"
                  [options]="accountOptions"
                  [(ngModel)]="account" /></label
              ><label
                >Cobrar ahora (ARS)<input
                  type="number"
                  min="0.01"
                  step="0.01"
                  [(ngModel)]="paymentAmount" /></label
              ><button
                class="sales-pay-total"
                type="button"
                (click)="useTotal()"
              >
                Cobrar el total
              </button>
            }
          </div>
          <p class="purchase-help">
            @if (!customer) {
              Elegí un cliente para dejar saldo pendiente.
            } @else {
              El importe pendiente queda en la cuenta corriente del cliente.
            }
          </p>
          @if (paymentMode === "now" && !accountOptions.length) {
            <p class="rate-note">
              Cargá el saldo inicial de una cuenta en Caja y cuentas para
              registrar el cobro.
            </p>
          }
        </div>
        <footer class="purchase-footer">
          <div class="sales-total">
            <span>Total de venta</span><strong>{{ amount(total) }}</strong
            ><small>Pendiente: {{ amount(pendingDraft) }}</small>
          </div>
          <button
            class="purchase-save"
            [disabled]="busy || !valid"
            (click)="save()"
          >
            {{ busy ? "Registrando…" : "Registrar venta" }}
          </button>
        </footer>
      </section>
    }
    @if (mode !== "customers" || selectedClient) {
      <section class="catalog-panel purchase-panel purchase-history">
        <div class="purchase-heading">
          <div>
            <h2>
              {{
                mode === "customers"
                  ? "Ventas del cliente"
                  : "Ventas registradas"
              }}
            </h2>
            <p>
              Últimas 100 ventas. Podés registrar nuevos cobros sobre el saldo
              pendiente.
            </p>
          </div>
        </div>
        @for (s of visibleHistory; track s.id) {
          <article class="sales-history-item">
            <div class="purchase-history-heading">
              <div>
                <h3>
                  Venta #{{ s.id }} ·
                  {{ s.customer_name || "Consumidor final" }}
                </h3>
                <small
                  >{{ s.sold_on }}
                  @if (s.note) {
                    · {{ s.note }}
                  }
                </small>
              </div>
              <div class="sales-balance">
                <strong>{{ amount(s.total) }}</strong
                ><span>Pendiente: {{ amount(s.pending) }}</span>
              </div>
            </div>
            <details>
              <summary>Ver productos y cobros</summary>
              <div class="purchase-history-lines">
                @for (item of s.items; track item.id) {
                  <div class="sale-item-detail">
                    <strong>{{ item.product_name }}</strong
                    ><span
                      >{{ item.quantity }} × {{ amount(item.unit_price) }} ·
                      {{ amount(item.total) }}</span
                    >
                    @for (c of item.components; track c.id) {
                      <small>{{ c.quantity }} × {{ c.product_name }}</small>
                    }
                  </div>
                }
                @for (p of s.payments; track p.id) {
                  <p class="purchase-help">
                    Cobro {{ p.occurred_on }} · {{ p.account_name }} ·
                    {{ amount(p.amount) }}
                  </p>
                }
              </div>
            </details>
            @if (+s.pending > 0) {
              <button class="purchase-add" (click)="openCollection(s)">
                Registrar cobro
              </button>
            }
            @if (collecting?.id === s.id) {
              <div class="purchase-payment-form">
                <h3>Cobrar venta #{{ s.id }}</h3>
                <div class="cash-form">
                  <label
                    >Cuenta<app-select
                      label="Cuenta de cobro"
                      placeholder="Elegir cuenta"
                      [options]="accountOptions"
                      [(ngModel)]="collectAccount" /></label
                  ><label
                    >Importe (ARS)<input
                      type="number"
                      min="0.01"
                      step="0.01"
                      [(ngModel)]="collectAmount" /></label
                  ><label
                    >Fecha<input type="date" [(ngModel)]="collectDate"
                  /></label>
                </div>
                @if (!accountOptions.length) {
                  <p class="rate-note">
                    Cargá primero el saldo inicial de una cuenta en Caja y
                    cuentas.
                  </p>
                }
                @if (collectionError) {
                  <p class="alert danger" role="alert">{{ collectionError }}</p>
                }
                <div class="sales-actions">
                  <button
                    class="purchase-save"
                    [disabled]="collectBusy || !validCollection"
                    (click)="collect()"
                  >
                    Guardar cobro</button
                  ><button class="text-button" (click)="collecting = null">
                    Cancelar
                  </button>
                </div>
              </div>
            }
          </article>
        } @empty {
          <p class="purchase-empty">Todavía no hay ventas registradas.</p>
        }
      </section>
    }
  </div>`,
})
export class SalesComponent implements OnInit {
  @Input() mode = "sales";
  @Input() products: any[] = [];
  @Output() saved = new EventEmitter<void>();
  http = inject(HttpClient);
  cdr = inject(ChangeDetectorRef);
  clients: any[] = [];
  accounts: any[] = [];
  history: any[] = [];
  clientHistory: any[] = [];
  selectedClient: any = null;
  customer: any = "";
  soldOn = this.today();
  note = "";
  lines: any[] = [];
  busy = false;
  error = "";
  notice = "";
  requestKey = crypto.randomUUID();
  paymentMode = "now";
  account: any = "";
  private customPaymentAmount: any = null;
  get paymentAmount(): any {
    return this.customPaymentAmount ?? this.total;
  }
  set paymentAmount(value: any) {
    this.customPaymentAmount = value;
  }
  useTotal() {
    this.customPaymentAmount = null;
  }
  paymentModes = [
    { value: "now", label: "Cobrar ahora" },
    { value: "credit", label: "Cuenta corriente" },
  ];
  clientError = "";
  clientForm = false;
  editingClient: any = null;
  clientName = "";
  clientPhone = "";
  clientInstagram = "";
  clientNote = "";
  clientBusy = false;
  clientSearch = "";
  collecting: any = null;
  collectAccount: any = "";
  collectAmount: any = "";
  collectDate = this.today();
  collectKey = crypto.randomUUID();
  collectBusy = false;
  collectionError = "";
  today() {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
  }
  async ngOnInit() {
    this.add();
    await this.load();
  }
  async load() {
    try {
      [this.clients, this.accounts, this.history] = await Promise.all([
        firstValueFrom(this.http.get<any[]>("/api/customers")),
        firstValueFrom(this.http.get<any[]>("/api/cash/accounts")),
        firstValueFrom(this.http.get<any[]>("/api/sales")),
      ]);
      if (!this.account)
        this.account =
          this.accounts.find(
            (a) =>
              a.currency === "ARS" &&
              a.balance != null &&
              a.name.trim().toLowerCase() === "transferencia",
          )?.id || "";
      if (this.selectedClient) await this.openClient(this.selectedClient);
    } catch (e: any) {
      this.error = e?.error?.message || "No se pudieron cargar las ventas";
    } finally {
      this.cdr.markForCheck();
    }
  }
  get chosenCustomer() {
    return this.clients.find((c) => c.id === Number(this.customer));
  }
  get clientOptions() {
    return this.clients.map((c) => ({
      value: c.id,
      label:
        c.name +
        ([c.phone, c.instagram].filter(Boolean).length
          ? " (" + [c.phone, c.instagram].filter(Boolean).join(" / ") + ")"
          : ""),
      search: [c.phone, c.instagram].filter(Boolean).join(" "),
    }));
  }
  get accountOptions() {
    return this.accounts
      .filter((a) => a.currency === "ARS" && a.balance != null)
      .map((a) => ({ value: a.id, label: a.name }));
  }
  get productOptions() {
    return this.products.map((p) => ({
      value: p.id,
      label: p.name,
      detail:
        p.kind === "kit"
          ? "Promo · elegir sabores"
          : "Stock: " + (p.own_stock ?? "Sin cargar"),
      search: (p.code || "") + " " + (p.barcode || ""),
    }));
  }
  add() {
    this.lines.push({
      product_id: "",
      quantity: 1,
      unit_price: "",
      discount: 0,
      priceEdited: false,
      slots: [],
    });
  }
  selected(line: any) {
    return this.products.find((p) => p.id === Number(line.product_id));
  }
  choose(line: any) {
    const p = this.selected(line);
    line.slots = [];
    line.unit_price = p?.selling_price ?? "";
    line.priceEdited = false;
    this.syncSlots(line);
  }
  promoIndexes(line: any): number[] {
    const quantity = Number(line.quantity);
    return Number.isInteger(quantity) && quantity > 0 && quantity <= 100
      ? Array.from({ length: quantity }, (_, i) => i)
      : [];
  }
  slotsForPromo(line: any, promo: number) {
    return line.slots.filter((s: any) => s.promo === promo);
  }
  syncSlots(line: any) {
    if (!this.promoIndexes(line).length) return;
    const p = this.selected(line);
    const old = new Map(line.slots.map((s: any) => [s.key, s]));
    line.slots = [];
    for (const promo of this.promoIndexes(line)) {
      for (const c of p?.components || []) {
        if (!c.variant_group) continue;
        for (let n = 0; n < c.quantity; n++) {
          const key = `${promo}:${c.product_id}:${n}`;
          line.slots.push(
            old.get(key) || {
              key,
              promo,
              component: c.product_id,
              label: c.name + (c.quantity > 1 ? " · unidad " + (n + 1) : ""),
              product_id: "",
              options: c.variants.map((v: any) => ({
                value: v.id,
                label: v.name,
                detail: "Stock: " + (v.own_stock ?? "Sin cargar"),
              })),
            },
          );
        }
      }
    }
    this.updateKitPrice(line);
  }
  updateKitPrice(line: any) {
    if (
      !line.priceEdited &&
      this.selected(line)?.kit_pricing_mode === "discount"
    )
      line.unit_price = this.basePromoPrice(line, 0).toString();
  }
  basePromoPrice(line: any, promo: number): Decimal {
    const p = this.selected(line);
    if (
      line.priceEdited ||
      p?.kind !== "kit" ||
      p.kit_pricing_mode !== "discount"
    )
      return new Decimal(line.unit_price || 0);
    let base = new Decimal(0);
    for (const c of p.components) {
      if (c.variant_group) {
        for (const slot of this.slotsForPromo(line, promo).filter(
          (s: any) => s.component === c.product_id,
        )) {
          const v = c.variants.find(
            (v: any) => v.id === Number(slot.product_id),
          );
          if (!v) return new Decimal(p.selling_price || 0);
          base = base.plus(v.selling_price);
        }
      } else base = base.plus(new Decimal(c.selling_price).mul(c.quantity));
    }
    return base
      .mul(new Decimal(1).minus(new Decimal(p.kit_discount_percent).div(100)))
      .div(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .mul(100);
  }
  promoPrice(line: any, promo: number): string {
    try {
      return this.basePromoPrice(line, promo)
        .mul(new Decimal(1).minus(new Decimal(line.discount || 0).div(100)))
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toString();
    } catch {
      return "0";
    }
  }
  selections(line: any, promo = 0) {
    const map = new Map<string, any>();
    for (const s of this.slotsForPromo(line, promo)) {
      const key = s.component + ":" + s.product_id;
      const entry = map.get(key) || {
        component_product_id: s.component,
        product_id: Number(s.product_id),
        quantity: 0,
      };
      entry.quantity++;
      map.set(key, entry);
    }
    return [...map.values()];
  }
  saleItems() {
    return this.lines.flatMap((l) =>
      l.slots.length
        ? this.promoIndexes(l).map((promo) => ({
            product_id: l.product_id,
            quantity: 1,
            unit_price: this.promoPrice(l, promo),
            selections: this.selections(l, promo),
          }))
        : [
            {
              product_id: l.product_id,
              quantity: l.quantity,
              unit_price: this.promoPrice(l, 0),
              selections: [],
            },
          ],
    );
  }
  lineTotal(l: any): Decimal {
    return l.slots.length
      ? this.promoIndexes(l).reduce(
          (sum, promo) => sum.plus(this.promoPrice(l, promo)),
          new Decimal(0),
        )
      : new Decimal(this.promoPrice(l, 0)).mul(l.quantity || 0);
  }
  amount(v: any) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 2,
    }).format(Number(v));
  }
  lineAmount(l: any) {
    try {
      return l.unit_price === ""
        ? "—"
        : this.amount(this.lineTotal(l).toString());
    } catch {
      return "—";
    }
  }
  get total() {
    try {
      return this.lines
        .reduce(
          (s: Decimal, l: any) => s.plus(this.lineTotal(l)),
          new Decimal(0),
        )
        .toString();
    } catch {
      return "0";
    }
  }
  get pendingDraft() {
    try {
      return Decimal.max(
        0,
        new Decimal(this.total).minus(
          this.paymentMode === "now" ? this.paymentAmount || 0 : 0,
        ),
      ).toString();
    } catch {
      return this.total;
    }
  }
  get stockPreview() {
    const needed = new Map<number, number>();
    for (const line of this.lines) {
      const p = this.selected(line),
        q = Number(line.quantity);
      if (!p || !Number.isInteger(q) || q <= 0) continue;
      if (p.kind !== "kit") needed.set(p.id, (needed.get(p.id) || 0) + q);
      else
        for (const c of p.components) {
          if (c.variant_group) {
            for (const slot of line.slots.filter(
              (s: any) => s.component === c.product_id && s.product_id,
            )) {
              const id = Number(slot.product_id);
              needed.set(id, (needed.get(id) || 0) + 1);
            }
          } else
            needed.set(
              c.product_id,
              (needed.get(c.product_id) || 0) + q * c.quantity,
            );
        }
    }
    return [...needed].map(([id, q]) => {
      const p = this.products.find((p) => p.id === id);
      return {
        id,
        name: p?.name || "",
        stock: p?.own_stock ?? null,
        after: p?.own_stock == null ? null : p.own_stock - q,
      };
    });
  }
  get hasNegativeStock() {
    return this.stockPreview.some((p) => p.after !== null && p.after < 0);
  }
  get valid() {
    try {
      return (
        !!this.soldOn &&
        this.lines.length > 0 &&
        this.saleItems().length <= 100 &&
        this.lines.every(
          (l) =>
            !!this.selected(l) &&
            Number.isInteger(Number(l.quantity)) &&
            Number(l.quantity) > 0 &&
            Number(l.quantity) <=
              (this.selected(l)?.components?.some((c: any) => c.variant_group)
                ? 100
                : 1e9) &&
            new Decimal(l.discount || 0).gte(0) &&
            new Decimal(l.discount || 0).lte(100) &&
            l.unit_price !== "" &&
            new Decimal(l.unit_price).gte(0) &&
            new Decimal(l.unit_price).decimalPlaces() <= 2 &&
            l.slots.every((s: any) => !!s.product_id),
        ) &&
        (this.paymentMode === "credit"
          ? !!this.customer
          : !!this.account &&
            new Decimal(this.paymentAmount).gt(0) &&
            new Decimal(this.paymentAmount).decimalPlaces() <= 2 &&
            new Decimal(this.paymentAmount).lte(this.total)) &&
        (!!this.customer || new Decimal(this.pendingDraft).eq(0))
      );
    } catch {
      return false;
    }
  }
  async save() {
    if (this.busy || !this.valid) return;
    this.busy = true;
    this.error = "";
    this.notice = "";
    try {
      const result: any = await firstValueFrom(
        this.http.post("/api/sales", {
          customer_id: this.customer || null,
          sold_on: this.soldOn,
          note: this.note,
          request_key: this.requestKey,
          items: this.saleItems(),
          payment:
            this.paymentMode === "now"
              ? { account_id: this.account, amount: String(this.paymentAmount) }
              : null,
        }),
      );
      this.notice =
        "Venta #" +
        result.id +
        " registrada. Stock y cuenta corriente actualizados.";
      if (result.warnings?.length)
        this.notice += " Aviso: " + result.warnings.join("; ") + ".";
      this.lines = [];
      this.add();
      this.note = "";
      this.useTotal();
      this.account = "";
      this.paymentMode = "now";
      this.requestKey = crypto.randomUUID();
      this.saved.emit();
      await this.load();
    } catch (e: any) {
      this.error =
        e?.error?.message ||
        "No se pudo registrar la venta. Podés reintentar sin duplicarla.";
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  newClient() {
    this.cancelClient();
    this.clientForm = true;
    this.clientError = "";
  }
  editClient(c: any) {
    this.clientError = "";
    this.editingClient = c;
    this.clientName = c.name;
    this.clientPhone = c.phone || "";
    this.clientInstagram = c.instagram || "";
    this.clientNote = c.note || "";
    this.clientForm = true;
  }
  cancelClient() {
    this.editingClient = null;
    this.clientName = "";
    this.clientPhone = "";
    this.clientInstagram = "";
    this.clientNote = "";
    this.clientForm = false;
  }
  async saveClient() {
    if (this.clientBusy || !this.clientName.trim()) return;
    this.clientBusy = true;
    this.clientError = "";
    try {
      const c: any = await firstValueFrom(
        this.http.request(
          this.editingClient ? "PUT" : "POST",
          "/api/customers" +
            (this.editingClient ? "/" + this.editingClient.id : ""),
          {
            body: {
              name: this.clientName,
              phone: this.clientPhone,
              instagram: this.clientInstagram,
              note: this.clientNote,
            },
          },
        ),
      );
      if (this.mode === "sales") this.customer = c.id;
      this.cancelClient();
      this.notice = "Cliente guardado.";
      await this.load();
    } catch (e: any) {
      this.clientError = e?.error?.message || "No se pudo guardar el cliente";
    } finally {
      this.clientBusy = false;
      this.cdr.markForCheck();
    }
  }
  get filteredClients() {
    const q = this.clientSearch.toLowerCase();
    return this.clients.filter((c) =>
      (c.name + " " + (c.phone || "") + " " + (c.instagram || ""))
        .toLowerCase()
        .includes(q),
    );
  }
  async openClient(c: any) {
    this.selectedClient = this.clients.find((x) => x.id === c.id) || c;
    try {
      this.clientHistory = await firstValueFrom(
        this.http.get<any[]>("/api/sales?customer_id=" + c.id),
      );
    } catch (e: any) {
      this.error = e?.error?.message || "No se pudo cargar la cuenta corriente";
    }
    this.cdr.markForCheck();
  }
  get currentClientBalance() {
    return (
      this.clients.find((c) => c.id === this.selectedClient?.id)?.balance || "0"
    );
  }
  get visibleHistory() {
    return this.mode === "customers" ? this.clientHistory : this.history;
  }
  get clientLedger() {
    return this.clientHistory
      .flatMap((s) => [
        {
          key: "sale" + s.id,
          date: s.sold_on,
          label: "Venta #" + s.id,
          value: s.total,
          debit: true,
        },
        ...s.payments.map((p: any) => ({
          key: "payment" + p.id,
          date: p.occurred_on,
          label: "Cobro venta #" + s.id + " · " + p.account_name,
          value: p.amount,
          debit: false,
        })),
      ])
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) || Number(b.debit) - Number(a.debit),
      );
  }
  openCollection(s: any) {
    this.collecting = s;
    this.collectAccount = "";
    this.collectAmount = s.pending;
    this.collectDate = this.today();
    this.collectKey = crypto.randomUUID();
    this.collectionError = "";
  }
  get validCollection() {
    try {
      return (
        !!this.collectAccount &&
        !!this.collectDate &&
        new Decimal(this.collectAmount).gt(0) &&
        new Decimal(this.collectAmount).lte(this.collecting.pending) &&
        new Decimal(this.collectAmount).decimalPlaces() <= 2
      );
    } catch {
      return false;
    }
  }
  async collect() {
    if (this.collectBusy || !this.validCollection) return;
    this.collectBusy = true;
    this.collectionError = "";
    try {
      await firstValueFrom(
        this.http.post("/api/sales/" + this.collecting.id + "/payments", {
          account_id: this.collectAccount,
          amount: String(this.collectAmount),
          occurred_on: this.collectDate,
          request_key: this.collectKey,
        }),
      );
      this.collecting = null;
      this.notice = "Cobro registrado. Cuenta corriente y caja actualizadas.";
      this.saved.emit();
      await this.load();
    } catch (e: any) {
      this.collectionError =
        e?.error?.message || "No se pudo registrar el cobro";
    } finally {
      this.collectBusy = false;
      this.cdr.markForCheck();
    }
  }
}
