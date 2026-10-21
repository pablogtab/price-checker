import { ButtonDirective } from "./ui/button";
import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  inject,
  ChangeDetectorRef,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import Decimal from "decimal.js";
import { SelectComponent } from "./select";
@Component({
  selector: "app-purchases",
  standalone: true,
  imports: [FormsModule, SelectComponent, ButtonDirective],
  template: ` <section class="catalog-panel purchase-panel">
      <div class="purchase-heading">
        <div>
          <h2>Nueva compra</h2>
          <p>Registrá lo recibido y actualizá tu stock.</p>
        </div>
        <span class="purchase-badge">Compra recibida</span>
      </div>
      <form (ngSubmit)="save()">
        <div class="purchase-fields">
          <label
            >Proveedor
            <app-select
              label="Proveedor"
              placeholder="Elegir proveedor"
              name="purchase-provider"
              [(ngModel)]="provider"
              (ngModelChange)="resetLines()"
              [disabled]="busy"
              [options]="providerOptions"
              required
            />
          </label>
          <label
            >Fecha de recepción<input
              name="purchase-date"
              type="date"
              [(ngModel)]="receivedOn"
              [disabled]="busy"
              required
          /></label>
          <label
            >Comprobante o nota <span class="purchase-optional">Opcional</span
            ><input
              name="purchase-note"
              maxlength="500"
              [(ngModel)]="note"
              [disabled]="busy"
              placeholder="Ej.: factura 0001-234"
          /></label>
        </div>
        <div class="purchase-products-heading">
          <h3>Productos recibidos</h3>
          <span
            >{{ lines.length }}
            {{ lines.length === 1 ? "producto" : "productos" }}</span
          >
        </div>
        <p class="purchase-help">
          Cargá unidades por sabor. Si recibís packs, ingresá el total de
          unidades vendibles que recibiste.
        </p>
        <div class="purchase-lines">
          <div class="purchase-table-header" aria-hidden="true">
            <span>Producto / sabor</span><span>Unidades</span
            ><span>Costo unitario</span><span>Moneda</span><span>Subtotal</span
            ><span></span>
          </div>
          @for (line of lines; track line; let i = $index) {
            <div class="purchase-line">
              <div class="purchase-product-field">
                <label class="purchase-field-label">Producto / sabor</label>
                <app-select
                  label="Producto / sabor"
                  [name]="'purchase-product-' + i"
                  [(ngModel)]="line.product_id"
                  (ngModelChange)="choose(line)"
                  [disabled]="busy || !provider"
                  [placeholder]="
                    provider
                      ? 'Buscar producto o sabor…'
                      : 'Elegí primero un proveedor'
                  "
                  [options]="productOptions(line)"
                  required
                />
                @if (selected(line); as p) {
                  <small>Stock actual: {{ p.own_stock ?? "Sin cargar" }}</small>
                  @if (p.own_stock == null) {
                    <button
                      type="button"
                      class="text-button"
                      (click)="stockRequested.emit(p)"
                    >
                      Cargar stock real antes de la compra
                    </button>
                  }
                }
              </div>
              <label
                ><span class="purchase-field-label">Unidades</span
                ><input
                  [name]="'purchase-qty-' + i"
                  type="number"
                  min="1"
                  step="1"
                  [(ngModel)]="line.quantity"
                  [disabled]="busy"
                  required
              /></label>
              <label
                ><span class="purchase-field-label">Costo unitario</span
                ><input
                  [name]="'purchase-cost-' + i"
                  type="number"
                  min="0"
                  step="any"
                  [(ngModel)]="line.unit_price"
                  (blur)="roundCost(line)"
                  [disabled]="busy"
                  placeholder="0,00"
                  required
              /></label>
              <label
                ><span class="purchase-field-label">Moneda</span
                ><app-select
                  label="Moneda"
                  [name]="'purchase-currency-' + i"
                  [(ngModel)]="line.currency"
                  (ngModelChange)="roundCost(line)"
                  [disabled]="busy"
                  [options]="currencyOptions"
              /></label>
              <div class="purchase-line-total">
                <span class="purchase-field-label">Subtotal</span
                ><strong>{{ lineAmount(line) }}</strong>
              </div>
              <button
                type="button"
                class="purchase-remove"
                (click)="remove(i)"
                [disabled]="busy || lines.length === 1"
                [attr.aria-label]="'Quitar producto ' + (i + 1)"
                title="Quitar producto"
              >
                ×
              </button>
            </div>
          }
        </div>
        <button
          type="button"
          class="purchase-add"
          (click)="add()"
          [disabled]="busy || !provider"
        >
          ＋ Agregar producto
        </button>
        @if (error) {
          <div class="alert danger" role="alert">{{ error }}</div>
        }
        @if (notice) {
          <p class="purchase-notice" role="status">{{ notice }}</p>
        }
        <div class="purchase-footer">
          <div class="purchase-totals">
            <span>Total de la compra</span>
            @for (t of totals; track t.currency) {
              <strong
                >{{ amount(t.value, t.currency) }}
                <small>{{ t.currency }}</small></strong
              >
            }
            @if (!totals.length) {
              <strong>—</strong>
            }
          </div>
          <div class="purchase-submit">
            <small>Al registrar, las unidades se suman al stock.</small>
            <button
              class="purchase-save"
              appButton="primary"
              type="submit"
              [disabled]="busy || !valid"
            >
              {{ busy ? "Registrando…" : "Registrar compra" }}
            </button>
          </div>
        </div>
      </form>
    </section>
    <section class="catalog-panel purchase-panel purchase-history-panel">
      <div class="purchase-heading">
        <div>
          <h2>Historial de compras</h2>
          <p>Últimas 100 compras recibidas.</p>
        </div>
        <span class="purchase-badge">{{ history.length }}</span>
      </div>
      @if (!history.length) {
        <div class="purchase-empty">
          <span aria-hidden="true">▤</span
          ><strong>Todavía no registraste compras</strong>
          <p>Las compras recibidas aparecerán acá con su detalle.</p>
        </div>
      }
      @for (p of history; track p.id) {
        <details class="purchase-history">
          <summary>
            <strong>Compra #{{ p.id }} · {{ p.provider_name }}</strong
            ><span>{{ p.received_on.split("-").reverse().join("/") }}</span>
            @for (t of itemTotals(p.items); track t.currency) {
              <span>{{ amount(t.value, t.currency) }}</span>
            }
          </summary>
          <div class="purchase-payment-summary">
            @for (t of pending(p); track t.currency) {
              <span
                >Pagado: {{ amount(t.paid, t.currency) }} ·
                <strong
                  >Pendiente: {{ amount(t.value, t.currency) }}</strong
                ></span
              >
            }
          </div>
          @for (payment of p.payments || []; track payment.id) {
            <p>
              Pago {{ payment.occurred_on.split("-").reverse().join("/") }} ·
              {{ payment.account_name }} ·
              {{ amount(payment.account_amount, payment.account_currency) }}
              @if (payment.account_currency !== payment.currency) {
                · Aplicado: {{ amount(payment.amount, payment.currency) }}
              }
            </p>
          }
          @if (hasPending(p)) {
            <button type="button" class="purchase-add" (click)="openPayment(p)">
              Registrar pago
            </button>
          }
          @if (paying?.id === p.id) {
            @if (!paymentAccountOptions.length) {
              <p>
                Cargá primero el saldo inicial de una cuenta en Caja y cuentas.
              </p>
            }
            <form class="cash-form purchase-payment-form" (ngSubmit)="pay()">
              <label
                >Cuenta<app-select
                  label="Cuenta para el pago"
                  name="payment-account"
                  [(ngModel)]="paymentAccount"
                  [options]="paymentAccountOptions"
                  placeholder="Elegir cuenta"
              /></label>
              <label
                >Moneda de la compra<app-select
                  label="Moneda de la compra"
                  name="payment-currency"
                  [(ngModel)]="paymentCurrency"
                  [options]="paymentCurrencyOptions"
              /></label>
              <label
                >Importe del pago {{ chosenPaymentAccount?.currency || ""
                }}<input
                  name="payment-amount"
                  type="number"
                  min="0.01"
                  step=".01"
                  [(ngModel)]="paymentValue"
                  required
              /></label>
              @if (
                chosenPaymentAccount &&
                chosenPaymentAccount.currency !== paymentCurrency
              ) {
                <label
                  >Importe aplicado a la compra ({{ paymentCurrency }})<input
                    name="payment-applied"
                    type="number"
                    min="0.0001"
                    step="any"
                    [(ngModel)]="paymentApplied"
                    required
                /></label>
              }
              <label
                >Fecha del pago<input
                  name="payment-date"
                  type="date"
                  [(ngModel)]="paymentDate"
                  required
              /></label>
              <button
                class="purchase-save"
                appButton="primary"
                [disabled]="paymentBusy || !validPayment"
              >
                {{ paymentBusy ? "Registrando…" : "Guardar pago" }}
              </button>
              <button
                class="text-button"
                type="button"
                (click)="paying = null"
                [disabled]="paymentBusy"
              >
                Cancelar
              </button>
            </form>
          }
          @if (p.note) {
            <p>{{ p.note }}</p>
          }
          @for (item of p.items; track item.id) {
            <p>
              {{ item.quantity }} × {{ item.product_name }} ·
              {{ amount(item.unit_price, item.currency) }} / unidad · Stock:
              {{ item.previous_stock }} → {{ item.resulting_stock }}
            </p>
          }
        </details>
      }
    </section>`,
})
export class PurchasesComponent implements OnInit {
  @Input() products: any[] = [];
  @Input() providers: any[] = [];
  @Output() saved = new EventEmitter<void>();
  @Output() stockRequested = new EventEmitter<any>();
  http = inject(HttpClient);
  cdr = inject(ChangeDetectorRef);
  provider: any = "";
  receivedOn = this.today();
  note = "";
  lines: any[] = [];
  history: any[] = [];
  accounts: any[] = [];
  paying: any = null;
  paymentAccount: any = "";
  paymentCurrency = "ARS";
  paymentValue = "";
  paymentApplied = "";
  paymentDate = this.today();
  paymentKey = crypto.randomUUID();
  paymentBusy = false;
  busy = false;
  error = "";
  notice = "";
  requestKey = crypto.randomUUID();
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
      this.accounts = await firstValueFrom(
        this.http.get<any[]>("/api/cash/accounts"),
      );
      this.history = await firstValueFrom(
        this.http.get<any[]>("/api/purchases"),
      );
    } catch (e: any) {
      this.error = e?.error?.message || "No se pudieron cargar las compras";
    } finally {
      this.cdr.markForCheck();
    }
  }
  add() {
    this.lines.push({
      product_id: "",
      quantity: 1,
      unit_price: "",
      currency: "ARS",
    });
  }
  remove(i: number) {
    this.lines.splice(i, 1);
  }
  resetLines() {
    this.lines = [];
    this.add();
    this.requestKey = crypto.randomUUID();
    this.error = "";
  }
  selected(line: any) {
    return this.products.find((p) => p.id === Number(line.product_id));
  }
  options(line: any) {
    return this.products.filter(
      (p) =>
        p.kind !== "kit" &&
        !this.lines.some(
          (other) => other !== line && Number(other.product_id) === p.id,
        ) &&
        p.offers?.some((o: any) => o.provider_id === Number(this.provider)),
    );
  }
  get providerOptions() {
    return this.providers.map((p) => ({ value: p.id, label: p.name }));
  }
  currencyOptions = [
    { value: "ARS", label: "ARS" },
    { value: "USD", label: "USD" },
  ];
  productOptions(line: any) {
    return this.options(line).map((p) => ({
      value: p.id,
      label: p.name,
      detail:
        (p.code || p.barcode || "Sin código") +
        " · Stock: " +
        (p.own_stock ?? "Sin cargar"),
      search: (p.code || "") + " " + (p.barcode || ""),
    }));
  }
  lineAmount(line: any) {
    try {
      if (line.unit_price === "") return "—";
      const total = new Decimal(line.unit_price).mul(line.quantity);
      return total.isFinite() && total.gte(0)
        ? this.amount(total.toString(), line.currency)
        : "—";
    } catch {
      return "—";
    }
  }
  choose(line: any) {
    const p = this.selected(line),
      o = p?.offers?.find((o: any) => o.provider_id === Number(this.provider));
    line.unit_price = o?.cost?.amount || "";
    line.currency = o?.cost?.currency || "ARS";
    this.roundCost(line);
  }
  roundCost(line: any) {
    if (line.unit_price === "" || line.unit_price == null) return;
    try {
      const value = new Decimal(line.unit_price);
      if (value.isFinite() && value.gte(0))
        line.unit_price = value.toFixed(
          line.currency === "USD" ? 4 : 2,
          Decimal.ROUND_HALF_UP,
        );
    } catch {}
  }
  get valid() {
    return (
      !!this.provider &&
      !!this.receivedOn &&
      this.lines.length > 0 &&
      new Set(this.lines.map((l) => l.product_id)).size === this.lines.length &&
      this.lines.every((l) => {
        try {
          const p = this.selected(l),
            c = new Decimal(l.unit_price);
          return (
            p?.own_stock != null &&
            l.unit_price !== "" &&
            Number.isInteger(Number(l.quantity)) &&
            Number(l.quantity) > 0 &&
            Number(l.quantity) <= 1000000000 &&
            c.isFinite() &&
            c.gte(0) &&
            c.lte("1e15")
          );
        } catch {
          return false;
        }
      })
    );
  }
  itemTotals(items: any[]) {
    const sums = new Map<string, Decimal>();
    for (const l of items) {
      try {
        const value = new Decimal(l.unit_price).mul(l.quantity);
        sums.set(
          l.currency,
          (sums.get(l.currency) || new Decimal(0)).plus(value),
        );
      } catch {}
    }
    return [...sums].map(([currency, value]) => ({
      currency,
      value: value.toString(),
    }));
  }
  get totals() {
    return this.itemTotals(this.lines);
  }
  amount(value: any, currency: string) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "USD" ? 4 : 2,
    }).format(Number(value));
  }
  pending(p: any) {
    return this.itemTotals(p.items).map((t) => {
      const paid = (p.payments || [])
        .filter((x: any) => x.currency === t.currency)
        .reduce((sum: Decimal, x: any) => sum.plus(x.amount), new Decimal(0));
      return {
        currency: t.currency,
        paid: paid.toString(),
        value: new Decimal(t.value).minus(paid).toString(),
      };
    });
  }
  hasPending(p: any) {
    return this.pending(p).some((t) => new Decimal(t.value).gt(0));
  }
  get paymentAccountOptions() {
    return this.accounts
      .filter((a) => a.balance != null)
      .map((a) => ({
        value: a.id,
        label: a.name,
        detail: this.amount(a.balance, a.currency),
      }));
  }
  get chosenPaymentAccount() {
    return this.accounts.find((a) => a.id === Number(this.paymentAccount));
  }
  get paymentCurrencyOptions() {
    return this.paying
      ? this.pending(this.paying)
          .filter((t) => new Decimal(t.value).gt(0))
          .map((t) => ({ value: t.currency, label: t.currency }))
      : [];
  }
  openPayment(p: any) {
    this.paying = p;
    this.paymentAccount = "";
    this.paymentCurrency =
      this.pending(p).find((t) => new Decimal(t.value).gt(0))?.currency ||
      "ARS";
    this.paymentValue = "";
    this.paymentApplied = "";
    this.paymentDate = this.today();
    this.paymentKey = crypto.randomUUID();
  }
  get appliedPayment() {
    return this.chosenPaymentAccount?.currency === this.paymentCurrency
      ? this.paymentValue
      : this.paymentApplied;
  }
  get validPayment() {
    try {
      return (
        !!this.chosenPaymentAccount &&
        !!this.paymentDate &&
        new Decimal(this.paymentValue).gt(0) &&
        new Decimal(this.appliedPayment).gt(0)
      );
    } catch {
      return false;
    }
  }
  async pay() {
    if (this.paymentBusy || !this.validPayment) return;
    this.paymentBusy = true;
    this.error = "";
    try {
      await firstValueFrom(
        this.http.post("/api/cash/operations", {
          kind: "expense",
          account_id: this.paymentAccount,
          amount: this.paymentValue,
          occurred_on: this.paymentDate,
          note: "Pago de compra #" + this.paying.id,
          request_key: this.paymentKey,
          purchase_id: this.paying.id,
          purchase_currency: this.paymentCurrency,
          purchase_amount: this.appliedPayment,
        }),
      );
      this.paying = null;
      this.notice = "Pago registrado. Saldo de la cuenta actualizado.";
      await this.load();
    } catch (e: any) {
      this.error = e?.error?.message || "No se pudo registrar el pago";
    } finally {
      this.paymentBusy = false;
      this.cdr.markForCheck();
    }
  }
  async save() {
    if (this.busy || !this.valid) return;
    this.busy = true;
    this.error = "";
    this.notice = "";
    try {
      const result: any = await firstValueFrom(
        this.http.post("/api/purchases", {
          provider_id: this.provider,
          received_on: this.receivedOn,
          note: this.note,
          request_key: this.requestKey,
          items: this.lines.map((l) => ({
            product_id: l.product_id,
            quantity: l.quantity,
            currency: l.currency,
            unit_price: new Decimal(l.unit_price).toString(),
          })),
        }),
      );
      this.notice = "Compra #" + result.id + " registrada. Stock actualizado.";
      this.saved.emit();
      this.lines = [];
      this.add();
      this.note = "";
      this.requestKey = crypto.randomUUID();
      await this.load();
    } catch (e: any) {
      this.error =
        e?.error?.message ||
        "No se pudo guardar la compra. Podés reintentar sin duplicarla.";
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
}
