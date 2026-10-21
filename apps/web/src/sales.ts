import {SaleAnnulmentComponent} from "./sale-annulment";
import {SaleCorrectionHistoryComponent} from "./sale-correction-history";
import {PaymentCorrectionComponent} from "./payment-correction";
import { SalesPromoPickerComponent } from "./sales-promo-picker";
import { CustomerEditorComponent } from "./customer-editor";
import { ButtonDirective } from "./ui/button";
import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  ChangeDetectorRef,
  OnInit,
  DoCheck,
  ViewChild,
  ElementRef,
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
  imports: [
    CustomerEditorComponent,
    PaymentCorrectionComponent,
    SaleAnnulmentComponent,
    SaleCorrectionHistoryComponent,
    SalesPromoPickerComponent,
    FormsModule,
    SelectComponent,
    A11yModule,
    ButtonDirective,
  ],
  template: ` <div class="purchase-page">
    @if (annullingSale) {<app-sale-annulment [sale]="annullingSale" (closed)="annullingSale=null" (saved)="saleAnnulled()" />}
    @if (correctingPayment) {<app-payment-correction [sale]="correctingPayment.sale" [payment]="correctingPayment.payment" [accounts]="accounts" (closed)="correctingPayment=null" (saved)="paymentCorrected()" />}
    @if (clientForm) {
      <app-customer-editor
        [customer]="editingClient"
        (closed)="cancelClient()"
        (saved)="customerSaved($event)"
      />
    }
    @if (error) {
      <p class="alert danger" role="alert">{{ error }}</p>
    }
    @if (notice) {
      <p class="purchase-notice" role="status">{{ notice }}</p>
    }

    @if (storageError) {
      <p class="alert" role="alert">
        El navegador no permite guardar el borrador. Mantené esta pestaña
        abierta hasta terminar.
      </p>
    }
    @if (draftPriceChanged) {
      <p class="alert" role="status">
        Hay precios distintos de los vigentes. Conservamos los importes del
        carrito.
        <button class="text-button" (click)="updateDraftPrices()">
          Actualizar precios
        </button>
      </p>
    }
    @if (draftProblems.length) {
      <p class="alert danger" role="alert">
        {{ draftProblems.join(" · ") }}. Quitá la selección y agregala
        nuevamente para corregirla.
      </p>
    }
    @if (pendingSubmission) {
      <p class="alert" role="status">
        El último envío está pendiente de verificar. Al confirmar verificaremos
        esa venta original antes de registrar otra.
        <button class="text-button" (click)="reviewOpen = true">
          Verificar envío pendiente
        </button>
      </p>
    }
    <nav class="sales-view-tabs" aria-label="Vista de ventas">
      <button
        type="button"
        appButton
        [class.active]="salesView === 'cart'"
        (click)="salesView = 'cart'; focusSearch()"
      >
        Nueva venta
      </button>
      <button
        type="button"
        appButton
        [class.active]="salesView === 'history'"
        (click)="salesView = 'history'"
      >
        Historial
      </button>
    </nav>
    @if (salesView === "cart") {
      <section class="catalog-panel purchase-panel">
        <div class="purchase-heading">
          <div>
            <h2>Nueva venta</h2>
            <p>Buscá, agregá con Enter y revisá antes de registrar.</p>
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
          <details class="sales-optional">
            <summary>Fecha y nota</summary>
            <label
              >Fecha de venta<input type="date" [(ngModel)]="soldOn"
            /></label>
            <label
              >Nota <span class="optional">opcional</span
              ><input maxlength="500" [(ngModel)]="note"
            /></label>
          </details>
        </div>
        <div class="purchase-section-heading">
          <h3>Productos vendidos</h3>
          <span
            >{{ lines.length }}
            {{ lines.length === 1 ? "producto" : "productos" }}</span
          >
        </div>
        <div class="sales-search">
          <label for="sales-search">Buscar productos</label>
          <input
            id="sales-search"
            #productSearch
            type="search"
            role="combobox"
            aria-label="Buscar productos"
            autocomplete="off"
            aria-controls="sales-results"
            [attr.aria-expanded]="searchQuery.trim().length > 0"
            [attr.aria-activedescendant]="
              searchQuery.trim() && searchResults.length
                ? 'sales-result-' + activeResult
                : null
            "
            placeholder="Nombre, código, código de barras o sabor…"
            [(ngModel)]="searchQuery"
            (ngModelChange)="activeResult = 0"
            (keydown)="searchKey($event)"
          />
          @if (searchQuery.trim()) {
            <div
              id="sales-results"
              role="listbox"
              aria-label="Resultados de productos"
              class="sales-search-results"
            >
              @for (p of searchResults; track p.id; let i = $index) {
                <button
                  type="button"
                  role="option"
                  [id]="'sales-result-' + i"
                  [attr.aria-selected]="i === activeResult"
                  [class.active]="i === activeResult"
                  (click)="addProduct(p)"
                >
                  <span
                    ><strong>{{ p.name }}</strong
                    ><small
                      >{{ p.code }} {{ p.barcode }} ·
                      {{
                        p.kind === "kit"
                          ? "Promo · elegir sabores"
                          : "Stock propio: " + (p.own_stock ?? "Sin cargar")
                      }}</small
                    ></span
                  >
                  <strong>{{ amount(p.selling_price) }}</strong>
                </button>
              } @empty {
                <p class="purchase-empty">
                  No hay productos para esa búsqueda.
                </p>
              }
            </div>
          }
          <small
            >↑ ↓ para elegir · Enter para agregar · No registra la venta.</small
          >
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
                ><strong>{{
                  selected(line)?.name ||
                    line.savedName ||
                    "Producto no disponible"
                }}</strong>
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
                  aria-label="Cantidad"
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
              </label>
              <div class="sales-subtotal">
                <span class="sales-field-label">Subtotal</span
                ><strong>{{ lineAmount(line) }}</strong>
              </div>
              <button
                class="purchase-remove"
                aria-label="Quitar producto vendido"
                (click)="lines.splice(i, 1)"
              >
                ×
              </button>
              @if (selected(line)?.kind === "kit") {
                <div class="sales-flavors">
                  @for (slot of slotsForPromo(line, 0); track slot.key) {
                    <small>{{ slotName(slot) }}</small>
                  }
                  <button
                    class="text-button"
                    [disabled]="line.quantity >= 100"
                    (click)="repeatPromo(line)"
                  >
                    Repetir combinación
                  </button>
                  <button
                    class="text-button"
                    (click)="addProduct(selected(line))"
                  >
                    Otra combinación
                  </button>
                </div>
              }
            </div>
          }
        </div>
        @if (!lines.length) {
          <p class="purchase-empty">
            El carrito está vacío. Buscá un producto para comenzar.
          </p>
        }
        @if (lines.length) {
          <button class="text-button" (click)="discardCart()">
            Descartar carrito
          </button>
        }
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
        <details class="sales-discount sales-global-discount">
          <summary>Aplicar descuento a la venta</summary>
          <label
            ><span>Tipo de descuento</span
            ><app-select
              label="Tipo de descuento"
              [(ngModel)]="discountMode"
              (ngModelChange)="discountValue = 0"
              [options]="discountModes"
          /></label>
          <label
            ><span>{{
              discountMode === "percent"
                ? "Descuento de venta (%)"
                : "Descuento de venta (ARS)"
            }}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              [attr.max]="discountMode === 'percent' ? 100 : null"
              [attr.aria-label]="
                discountMode === 'percent'
                  ? 'Descuento de venta (%)'
                  : 'Descuento de venta (ARS)'
              "
              [(ngModel)]="discountValue"
            />
          </label>
          <small
            >Se aplica una sola vez al subtotal de productos y promos.</small
          >
          @if (!discountValid) {
            <p class="alert danger" role="alert">
              El descuento debe ser positivo, no superar el subtotal y tener
              hasta dos decimales. El porcentaje admite de 0 a 100.
            </p>
          }
        </details>
        <footer class="purchase-footer">
          <div class="sales-total">
            <span>Subtotal: {{ amount(subtotal) }}</span
            ><span>Descuento: −{{ amount(discountAmount) }}</span
            ><span>Total de venta</span><strong>{{ amount(total) }}</strong
            ><small
              >Cobrado:
              {{ amount(paymentMode === "now" ? paymentAmount : 0) }} ·
              Pendiente: {{ amount(pendingDraft) }}</small
            >
          </div>
          <button
            class="purchase-save"
            appButton="primary"
            [disabled]="busy || !cartValid"
            (click)="reviewOpen = true"
          >
            Revisar venta
          </button>
        </footer>
      </section>
    }
    @if (promoDraft) {
      <app-sales-promo-picker
        [name]="selected(promoDraft)?.name || ''"
        [slots]="promoDraft.slots"
        [price]="amount(promoDraft.unit_price)"
        (changed)="updateKitPrice(promoDraft)"
        (cancel)="closePromo()"
        (confirm)="acceptPromo()"
      />
    }
    @if (reviewOpen) {
      <div
        class="modal-backdrop"
        (click)="closeReview()"
        (keydown.escape)="closeReview(); $event.stopPropagation()"
      >
        <section
          class="modal sales-review"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sales-review-title"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
          (click)="$event.stopPropagation()"
        >
          <h2 id="sales-review-title">Revisar venta</h2>
          @if (pendingSubmission) {
            <p class="alert" role="status">
              Estamos verificando el envío original. Los cambios posteriores del
              carrito no se enviarán en este intento.
            </p>
            <ul>
              @for (item of pendingSubmission.items; track $index) {
                <li>
                  {{ item.quantity }} × {{ productsName(item.product_id) }} ·
                  {{ amount(item.unit_price) }} por unidad
                </li>
              }
            </ul>
            <p>{{ pendingCustomerName }} · {{ pendingSubmission.sold_on }}</p>
            <p>Total original: <strong>{{ amount(pendingTotal) }}</strong></p>
            <p>Cobro original: {{ amount(pendingSubmission.payment?.amount || 0) }} · {{ pendingAccountName }}</p>
          } @else {
          <p>{{ chosenCustomer?.name || "Consumidor final" }} · {{ soldOn }}</p>
          @for (line of lines; track line) {
            <div class="sales-review-line">
              <span
                ><strong>{{
                  selected(line)?.name ||
                    line.savedName ||
                    "Producto no disponible"
                }}</strong>
                <small
                  >{{ line.quantity }} × {{ amount(line.unit_price) }}</small
                >
                @for (slot of line.slots; track slot.key) {
                  <small>{{ slotName(slot) }}</small>
                }</span
              ><strong>{{ lineAmount(line) }}</strong>
            </div>
          }
          @if (total === "0") {
            <p class="purchase-help">
              Total cero: se registra sin cobro ni movimiento de Caja.
            </p>
          } @else {
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
          }

          <div class="sales-total">
            <span>Subtotal: {{ amount(subtotal) }}</span
            ><span>Descuento: −{{ amount(discountAmount) }}</span
            ><span>Total de venta</span><strong>{{ amount(total) }}</strong
            ><span
              >Cobrado:
              {{ amount(paymentMode === "now" ? paymentAmount : 0) }}</span
            ><strong>Pendiente: {{ amount(pendingDraft) }}</strong>
          </div>
          @if (!valid) {
            <p class="rate-note">
              Revisá la cuenta y el importe. Para dejar un pendiente, elegí un
              cliente.
            </p>
          }
          }
          @if (error) {
            <p class="alert danger" role="alert">{{ error }}</p>
          }
          @if (!pendingSubmission && hasNegativeStock) {
            <p class="stock-warning">
              La venta dejará stock negativo. Podés confirmarla igualmente.
            </p>
          }
          <div class="sales-actions">
            <button
              type="button"
              appButton
              [disabled]="busy"
              (click)="closeReview()"
            >
              Volver al carrito
            </button>
            <button
              type="button"
              appButton="primary"
              [disabled]="busy || (!valid && !pendingSubmission)"
              (click)="save()"
            >
              {{ busy ? "Registrando…" : "Confirmar venta" }}
            </button>
          </div>
        </section>
      </div>
    }
    @if (salesView === "history") {
      <section class="catalog-panel purchase-panel purchase-history">
        <div class="purchase-heading">
          <div>
            <h2>Ventas registradas</h2>
            <p>
              Últimas 100 ventas. Podés registrar nuevos cobros sobre el saldo
              pendiente.
            </p>
          </div>
        </div>
        @for (s of history; track s.id) {
          <article class="sales-history-item">
            <div class="purchase-history-heading">
              <div>
                <h3>
                  Venta #{{ s.id }} ·
                  {{ s.customer_name || "Consumidor final" }}
                </h3>
                @if(s.status === "annulled"){<strong class="alert danger">Anulada · {{s.annulled_at}}</strong>}
                <small
                  >{{ s.sold_on }}
                  @if (s.note) {
                    · {{ s.note }}
                  }
                </small>
              </div>
              <div class="sales-balance">
                <small>Subtotal: {{ amount(s.subtotal ?? s.total) }}</small>
                <small
                  >Descuento: −{{ amount(s.discount_amount || 0) }}
                  @if (s.discount_mode === "percent") {
                    ({{ s.discount_value }}%)
                  }
                </small>
                <strong>{{ amount(s.total) }}</strong
                ><span
                  >Cobrado: {{ amount(s.paid) }} · Pendiente:
                  {{ amount(s.pending) }}</span
                >
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
                      Subtotal {{ amount(item.subtotal ?? item.total) }} ·
                      Descuento {{ amount(item.discount_amount || 0) }} · Neto
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
                    <button
                      class="text-button"
                      (click)="correctingPayment = { sale: s, payment: p }"
                    >
                      Corregir cobro
                    </button>
                  </p>
                }
              </div>
              <app-sale-correction-history [saleId]="s.id" />
            </details>
            @if (s.status !== "annulled") {<button appButton="ghost" (click)="annullingSale=s">Anular</button>}
            @if (s.status !== "annulled" && +s.pending > 0) {
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
                    appButton="primary"
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
export class SalesComponent implements OnInit, DoCheck {
  @Input() products: any[] = [];
  @Output() saved = new EventEmitter<void>();
  http = inject(HttpClient);
  cdr = inject(ChangeDetectorRef);
  clients: any[] = [];
  accounts: any[] = [];
  history: any[] = [];
  annullingSale:any=null;
  async saleAnnulled(){this.annullingSale=null;this.collecting=null;await this.load();this.saved.emit();}
  correctingPayment:any=null;
  async paymentCorrected(){this.correctingPayment=null;await this.load();this.saved.emit();}
  customer: any = "";
  soldOn = this.today();
  note = "";
  lines: any[] = [];
  salesView = "cart";
  reviewOpen = false;
  searchQuery = "";
  activeResult = 0;
  @ViewChild("productSearch") productSearch?: ElementRef<HTMLInputElement>;
  focusSearch() {
    setTimeout(() => this.productSearch?.nativeElement.focus());
  }
  get searchResults() {
    const normalize = (v: any) =>
      String(v || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    const terms = normalize(this.searchQuery).trim().split(/\s+/);
    return this.products
      .filter((p) =>
        terms.every((t) =>
          normalize([p.name, p.code, p.barcode].join(" ")).includes(t),
        ),
      )
      .slice(0, 12);
  }
  searchKey(event: KeyboardEvent) {
    if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key))
      event.preventDefault();
    if (event.key === "Escape") this.searchQuery = "";
    if (event.key === "ArrowDown" && this.searchResults.length)
      this.activeResult = (this.activeResult + 1) % this.searchResults.length;
    if (event.key === "ArrowUp" && this.searchResults.length)
      this.activeResult =
        (this.activeResult + this.searchResults.length - 1) %
        this.searchResults.length;
    if (
      event.key === "Enter" &&
      !event.isComposing &&
      this.searchQuery.trim() &&
      this.searchResults[this.activeResult]
    )
      this.addProduct(this.searchResults[this.activeResult]);
    document
      .getElementById("sales-result-" + this.activeResult)
      ?.scrollIntoView({ block: "nearest" });
  }
  promoDraft: any = null;
  closePromo() {
    this.promoDraft = null;
    this.searchQuery = "";
    this.activeResult = 0;
    this.focusSearch();
  }
  acceptPromo() {
    if (
      !this.promoDraft ||
      !this.promoDraft.slots.every((s: any) =>
        s.options.some((o: any) => o.value === Number(s.product_id)),
      )
    )
      return;
    this.promoDraft.combination = this.promoDraft.slots.map((s: any) => ({
      ...s,
    }));
    this.promoDraft.frozenPrice = true;
    this.lines.push(this.promoDraft);
    this.closePromo();
  }
  repeatPromo(line: any) {
    if (Number(line.quantity) >= 100) return;
    line.quantity = Number(line.quantity) + 1;
    this.syncSlots(line);
    this.focusSearch();
  }
  addProduct(p: any) {
    if (p.kind === "kit") {
      this.promoDraft = {
        product_id: p.id,
        quantity: 1,
        unit_price: p.selling_price,
        discount: 0,
        discount_mode: "amount",
        priceEdited: false,
        slots: [],
      };
      this.syncSlots(this.promoDraft);
      return;
    }
    const existing =
      p.kind !== "kit" && this.lines.find((l) => Number(l.product_id) === p.id);
    if (existing) existing.quantity = Number(existing.quantity) + 1;
    else {
      this.add();
      const line = this.lines[this.lines.length - 1];
      line.product_id = p.id;
      this.choose(line);
    }
    this.searchQuery = "";
    this.activeResult = 0;
    this.focusSearch();
  }
  async discardCart() {
    if (this.busy) return;
    this.busy = true;
    try {
      if (this.pendingSubmission) {
        const result = await firstValueFrom(this.http.get<any>("/api/sales/requests/" + this.pendingSubmission.request_key));
        if (result?.id) {
          this.notice = "La venta #" + result.id + " ya estaba registrada. Se limpió el carrito sin registrar otra venta.";
          this.saved.emit();
          await this.load();
        }
      }
      this.resetDraft();
      this.error = "";
      this.focusSearch();
    } catch {
      this.error = "No pudimos verificar el envío anterior. Conservamos el carrito; reintentá cuando vuelva la conexión.";
    } finally { this.busy = false; this.cdr.markForCheck(); }
  }
  closeReview() {
    if (this.busy) return;
    this.reviewOpen = false;
    this.focusSearch();
  }
  slotName(slot: any) {
    return (
      slot.options.find((o: any) => o.value === Number(slot.product_id))
        ?.label || "Sabor sin elegir"
    );
  }

  busy = false;
  error = "";
  notice = "";
  requestKey = crypto.randomUUID();
  paymentMode = "now";
  account: any = "";
  private customPaymentAmount: any = null;
  get paymentAmount(): any {
    return this.total === "0" ? "0" : (this.customPaymentAmount ?? this.total);
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
  clientForm = false;
  editingClient: any = null;
  collecting: any = null;
  collectAccount: any = "";
  collectAmount: any = "";
  collectDate = this.today();
  collectKey = crypto.randomUUID();
  collectBusy = false;
  collectionError = "";
  today() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }
  productsName(id: any) {
    return (
      this.products.find((p) => p.id === Number(id))?.name || "Producto #" + id
    );
  }
  get pendingCustomerName() {return this.clients.find(c=>c.id===Number(this.pendingSubmission?.customer_id))?.name || "Consumidor final";}
  get pendingAccountName() {return this.accounts.find(a=>a.id===Number(this.pendingSubmission?.payment?.account_id))?.name || "Cuenta corriente / sin cobro";}
  get pendingTotal() {
    const subtotal = (this.pendingSubmission?.items || []).reduce((sum: Decimal,i:any)=>sum.plus(new Decimal(i.unit_price).mul(i.quantity)),new Decimal(0));
    const discount = this.pendingSubmission?.discount || {mode:"amount",value:0};
    const reduction = discount.mode === "percent" ? subtotal.mul(discount.value).div(100).toDecimalPlaces(2,Decimal.ROUND_HALF_UP) : new Decimal(discount.value);
    return subtotal.minus(reduction).toString();
  }
  private draftReady = false;
  private draftSnapshot = "";
  private readonly draftKey = "gevafit.sales-draft.v1";
  pendingSubmission: any = null;
  storageError = false;
  ngDoCheck() {
    if (this.draftReady) this.persistDraft();
  }
  private draftState() {
    return {
      version: 1,
      lines: this.lines,
      customer: this.customer,
      soldOn: this.soldOn,
      note: this.note,
      discountMode: this.discountMode,
      discountValue: this.discountValue,
      account: this.account,
      paymentMode: this.paymentMode,
      customPaymentAmount: this.customPaymentAmount,
      requestKey: this.requestKey,
      pendingSubmission: this.pendingSubmission,
    };
  }
  persistDraft() {
    try {
      for (const line of this.lines) {
        if (!line.savedName) line.savedName = this.selected(line)?.name;
        if (line.savedComposition == null && this.selected(line))
          line.savedComposition = this.composition(this.selected(line));
      }
      const serialized = JSON.stringify(this.draftState());
      if (serialized === this.draftSnapshot) return;
      localStorage.setItem(this.draftKey, serialized);
      this.draftSnapshot = serialized;
    } catch {
      this.storageError = true;
    }
  }
  private restoreDraft() {
    try {
      const state = JSON.parse(localStorage.getItem(this.draftKey) || "null");
      if (state?.version === 1 && Array.isArray(state.lines)) {
        for (const field of [
          "customer",
          "soldOn",
          "note",
          "discountMode",
          "discountValue",
          "account",
          "paymentMode",
          "customPaymentAmount",
          "requestKey",
          "pendingSubmission",
        ])
          if (field in state) (this as any)[field] = state[field];
        this.lines = state.lines.map((line: any) => ({
          ...line,
          frozenPrice: true,
          slots: line.slots || [],
          combination:
            line.combination ||
            (line.slots || []).filter((s: any) => s.promo === 0),
        }));
        if (this.lines.length)
          this.notice =
            "Carrito recuperado. Revisá los precios y el cobro antes de confirmar.";
      }
    } catch {
      this.error =
        "No se pudo recuperar el borrador guardado. Podés descartarlo para empezar otra venta.";
    }
    this.draftReady = true;
  }
  private resetDraft() {
    this.pendingSubmission = null;
    this.lines = [];
    this.customer = "";
    this.soldOn = this.today();
    this.note = "";
    this.discountMode = "amount";
    this.discountValue = 0;
    this.paymentMode = "now";
    this.account = "";
    this.useTotal();
    this.requestKey = crypto.randomUUID();
    try { localStorage.removeItem(this.draftKey); } catch { this.storageError = true; }
    this.draftSnapshot = "";
    this.persistDraft();
  }
  currentDraftPrice(line: any) {
    const current = { ...line, frozenPrice: false, priceEdited: false };
    if (
      this.selected(line)?.kind !== "kit" ||
      this.selected(line)?.kit_pricing_mode !== "discount"
    )
      return this.selected(line)?.selling_price;
    return this.basePromoPrice(current, 0).toString();
  }
  get draftPriceChanged() {
    return this.lines.some((l) => {
      try {
        return (
          this.currentDraftPrice(l) != null &&
          !new Decimal(l.unit_price || 0).eq(this.currentDraftPrice(l))
        );
      } catch {
        return false;
      }
    });
  }
  updateDraftPrices() {
    for (const line of this.lines) {
      const price = this.currentDraftPrice(line);
      if (price != null) {
        line.unit_price = price;
        line.priceEdited = false;
        line.frozenPrice = true;
      }
    }
    this.persistDraft();
  }
  composition(product: any) {
    return JSON.stringify(
      (product?.components || []).map((c: any) => [
        c.product_id,
        c.quantity,
        c.variant_group || null,
      ]),
    );
  }
  get draftProblems(): string[] {
    const issues: string[] = [];
    if (
      this.customer &&
      !this.clients.some((c) => c.id === Number(this.customer))
    )
      issues.push("Cliente no disponible");
    if (
      this.paymentMode === "now" &&
      this.account &&
      !this.accountOptions.some((a) => a.value === Number(this.account))
    )
      issues.push("Cuenta de cobro no disponible");
    for (const line of this.lines) {
      const product = this.selected(line);
      if (!product) {
        issues.push((line.savedName || "Producto") + ": ya no disponible");
        continue;
      }
      if (
        line.savedComposition != null &&
        line.savedComposition !== this.composition(product)
      )
        issues.push(product.name + ": cambiaron los componentes");
      for (const slot of line.slots || []) {
        const component = product.components?.find(
          (c: any) => c.product_id === slot.component,
        );
        if (
          !component?.variants?.some(
            (v: any) => v.id === Number(slot.product_id),
          )
        )
          issues.push(product.name + ": sabor no disponible");
      }
      const expected =
        (product.components || [])
          .filter((c: any) => c.variant_group)
          .reduce((n: number, c: any) => n + Number(c.quantity), 0) *
        Number(line.quantity);
      if (expected !== (line.slots || []).length)
        issues.push(product.name + ": cambiaron los componentes");
    }
    return [...new Set(issues)];
  }
  async ngOnInit() {
    await this.load();
    this.restoreDraft();
    this.focusSearch();
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
      discount_mode: "amount",
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
              product_id:
                line.combination?.find(
                  (s: any) =>
                    s.component === c.product_id &&
                    s.key.split(":").at(-1) === String(n),
                )?.product_id || "",
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
      !line.frozenPrice &&
      !line.priceEdited &&
      this.selected(line)?.kit_pricing_mode === "discount"
    )
      line.unit_price = this.basePromoPrice(line, 0).toString();
  }
  basePromoPrice(line: any, promo: number): Decimal {
    const p = this.selected(line);
    if (
      line.frozenPrice ||
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
  discountModes = [
    { value: "amount", label: "Importe (ARS)" },
    { value: "percent", label: "Porcentaje (%)" },
  ];
  discountedLine(l: any) {
    const items = l.slots.length
      ? this.promoIndexes(l).map((promo) => ({
          product_id: l.product_id,
          quantity: 1,
          unit_price: this.basePromoPrice(l, promo).toString(),
          selections: this.selections(l, promo),
        }))
      : [
          {
            product_id: l.product_id,
            quantity: Number(l.quantity) || 1,
            unit_price: this.basePromoPrice(l, 0).toString(),
            selections: [],
          },
        ];
    return items;
  }
  promoPrice(line: any, promo: number): string {
    try {
      return this.discountedLine(line)[promo]?.unit_price || "0";
    } catch {
      return "0";
    }
  }
  saleItems() {
    return this.lines.flatMap((l) => this.discountedLine(l));
  }
  lineTotal(l: any): Decimal {
    return this.discountedLine(l).reduce(
      (sum, i) => sum.plus(new Decimal(i.unit_price).mul(i.quantity)),
      new Decimal(0),
    );
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
  discountMode = "amount";
  discountValue: any = 0;
  get subtotal() {
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
  get discountValid() {
    try {
      const v = new Decimal(this.discountValue ?? 0);
      return (
        v.isFinite() &&
        v.gte(0) &&
        v.decimalPlaces() <= 2 &&
        (this.discountMode === "percent"
          ? v.lte(100)
          : this.discountMode === "amount" && v.lte(this.subtotal))
      );
    } catch {
      return false;
    }
  }
  get discountAmount() {
    if (!this.discountValid) return "0";
    const value = new Decimal(this.discountValue ?? 0);
    return (
      this.discountMode === "percent"
        ? new Decimal(this.subtotal).mul(value).div(100).toDecimalPlaces(2)
        : value
    ).toString();
  }
  get total() {
    return new Decimal(this.subtotal).minus(this.discountAmount).toString();
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
  get cartValid() {
    try {
      return (
        !this.draftProblems.length &&
        !!this.soldOn &&
        this.lines.length > 0 &&
        this.saleItems().length <= 100 &&
        this.discountValid &&
        this.lines.every(
          (l) =>
            !!this.selected(l) &&
            Number.isInteger(Number(l.quantity)) &&
            Number(l.quantity) > 0 &&
            Number(l.quantity) <=
              (this.selected(l)?.components?.some((c: any) => c.variant_group)
                ? 100
                : 1e9) &&
            l.unit_price !== "" &&
            new Decimal(l.unit_price).gte(0) &&
            new Decimal(l.unit_price).decimalPlaces() <= 2 &&
            l.slots.every((s: any) => !!s.product_id),
        )
      );
    } catch {
      return false;
    }
  }
  get valid() {
    try {
      return (
        this.cartValid &&
        (new Decimal(this.total).eq(0) ||
          (this.paymentMode === "credit"
            ? !!this.customer
            : this.accountOptions.some(
                (a) => a.value === Number(this.account),
              ) &&
              new Decimal(this.paymentAmount).gt(0) &&
              new Decimal(this.paymentAmount).decimalPlaces() <= 2 &&
              new Decimal(this.paymentAmount).lte(this.total))) &&
        (!!this.customer || new Decimal(this.pendingDraft).eq(0))
      );
    } catch {
      return false;
    }
  }
  async save() {
    if (
      this.busy ||
      (!this.valid && !this.pendingSubmission) ||
      !this.reviewOpen
    )
      return;
    this.busy = true;
    this.error = "";
    this.notice = "";
    try {
      if (!this.pendingSubmission) {
        [this.products, this.accounts, this.clients] = await Promise.all([
          firstValueFrom(this.http.get<any[]>("/api/products")),
          firstValueFrom(this.http.get<any[]>("/api/cash/accounts")),
          firstValueFrom(this.http.get<any[]>("/api/customers")),
        ]);
        if (!this.valid)
          throw new Error(
            "Revisá las selecciones del carrito: un producto, sabor, cliente o cuenta ya no está disponible.",
          );
      }
      // A lost response keeps its immutable payload and key, including across reloads.
      // Resolve that attempt before accepting any changed cart as another sale.
      let result: any;
      if (this.pendingSubmission) {
        result = await firstValueFrom(
          this.http.get<any>(
            "/api/sales/requests/" + this.pendingSubmission.request_key,
          ),
        );
      }
      if (!result?.id) {
        if (!this.pendingSubmission)
          this.pendingSubmission = {
            customer_id: this.customer || null,
            sold_on: this.soldOn,
            note: this.note,
            request_key: this.requestKey,
            items: this.saleItems(),
            discount: {
              mode: this.discountMode,
              value: String(this.discountValue ?? 0),
            },
            payment:
              this.paymentMode === "now" && new Decimal(this.total).gt(0)
                ? {
                    account_id: this.account,
                    amount: String(this.paymentAmount),
                  }
                : null,
          };
        this.persistDraft();
        result = await firstValueFrom(
          this.http.post("/api/sales", this.pendingSubmission),
        );
      }
      this.notice =
        "Venta #" +
        result.id +
        " registrada. Stock y cuenta corriente actualizados.";
      if (result.warnings?.length)
        this.notice += " Aviso: " + result.warnings.join("; ") + ".";
      this.reviewOpen = false;
      this.resetDraft();
      this.focusSearch();
      this.saved.emit();
      await this.load();
    } catch (e: any) {
      // Definite validation failures did not commit; transport/5xx remain uncertain.
      if (e.status >= 400 && e.status < 500 && e.status !== 409)
        this.pendingSubmission = null;
      this.persistDraft();
      this.error =
        e?.error?.message ||
        (e.status == null ? e.message : null) ||
        "No se pudo registrar la venta. Podés reintentar sin duplicarla.";
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  newClient() {
    this.editingClient = null;
    this.clientForm = true;
  }
  editClient(c: any) {
    this.editingClient = c;
    this.clientForm = true;
  }
  cancelClient() {
    this.editingClient = null;
    this.clientForm = false;
    this.focusSearch();
  }
  async customerSaved(c: any) {
    this.customer = c.id;
    this.cancelClient();
    this.notice = "Cliente guardado.";
    await this.load();
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
