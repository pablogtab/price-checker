import { ButtonDirective } from "./ui/button";
import { Component, inject, OnInit, ChangeDetectorRef } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import Decimal from "decimal.js";
import { SelectComponent } from "./select";
@Component({
  selector: "app-cash",
  standalone: true,
  imports: [FormsModule, SelectComponent, ButtonDirective],
  template: ` @if (error) {
      <div class="alert danger" role="alert">{{ error }}</div>
    }
    @if (notice) {
      <p class="purchase-notice" role="status">{{ notice }}</p>
    }
    <div class="cash-account-grid">
      @for (a of accounts; track a.id) {
        <section class="catalog-panel cash-account">
          <div>
            <h2>{{ a.name }}</h2>
            <span class="purchase-badge">{{ a.currency }}</span>
          </div>
          <strong [class.cash-expense]="isNegative(a.balance)">{{
            a.balance == null
              ? "Saldo sin cargar"
              : amount(a.balance, a.currency)
          }}</strong>
          @if (a.balance == null) {
            <button
              type="button"
              class="purchase-add"
              (click)="opening = a; openingValue = ''"
            >
              Cargar saldo inicial
            </button>
          } @else {
            <small>{{
              isNegative(a.balance) ? "Saldo negativo" : "Saldo actual"
            }}</small>
          }
        </section>
      }
      <button class="cash-new-account" (click)="creating = !creating">
        ＋ Nueva cuenta
      </button>
    </div>
    @if (opening) {
      <section class="catalog-panel purchase-panel">
        <h2>Saldo inicial · {{ opening.name }}</h2>
        <form class="cash-form" (ngSubmit)="saveOpening()">
          <label
            >Saldo real ({{ opening.currency }})<input
              name="opening"
              type="number"
              step=".01"
              [(ngModel)]="openingValue"
              required
          /></label>
          <button
            class="purchase-save"
            appButton="primary"
            [disabled]="busy || !validBalance(openingValue)"
          >
            Guardar saldo</button
          ><button type="button" class="text-button" (click)="opening = null">
            Cancelar
          </button>
        </form>
        <p>Ingresá el saldo actual antes de registrar movimientos.</p>
      </section>
    }
    @if (creating) {
      <section class="catalog-panel purchase-panel">
        <h2>Nueva cuenta</h2>
        <form class="cash-form" (ngSubmit)="create()">
          <label
            >Nombre<input
              name="account-name"
              [(ngModel)]="accountName"
              maxlength="100"
              required
          /></label>
          <label
            >Moneda<app-select
              name="account-currency"
              label="Moneda"
              [(ngModel)]="accountCurrency"
              [options]="currencies"
          /></label>
          <label
            >Saldo inicial<input
              name="account-balance"
              type="number"
              step=".01"
              [(ngModel)]="accountBalance"
              required
          /></label>
          <button
            class="purchase-save"
            appButton="primary"
            [disabled]="
              busy || !accountName.trim() || !validBalance(accountBalance)
            "
          >
            Crear cuenta
          </button>
        </form>
      </section>
    }
    <section class="catalog-panel purchase-panel">
      <div class="purchase-heading">
        <div>
          <h2>Registrar movimiento</h2>
          <p>
            Ingresos, egresos y transferencias entre tus cuentas. Los saldos
            pueden quedar negativos para registrar deudas.
          </p>
        </div>
      </div>
      <form (ngSubmit)="save()">
        <div class="cash-form">
          <label
            >Tipo<app-select
              name="movement-kind"
              label="Tipo"
              [(ngModel)]="kind"
              (ngModelChange)="newKey()"
              [options]="kinds"
              [disabled]="busy"
          /></label>
          <label
            >{{ kind === "transfer" ? "Cuenta de origen" : "Cuenta"
            }}<app-select
              name="movement-account"
              label="Cuenta"
              [(ngModel)]="account"
              (ngModelChange)="destination = ''"
              [options]="accountOptions"
              [disabled]="busy"
              placeholder="Elegir cuenta"
          /></label>
          @if (kind === "transfer") {
            <label
              >Cuenta de destino<app-select
                name="destination"
                label="Cuenta de destino"
                [(ngModel)]="destination"
                [options]="destinationOptions"
                [disabled]="busy"
                placeholder="Elegir cuenta"
            /></label>
          }
          <label
            >Importe {{ selectedAccount?.currency || ""
            }}<input
              name="movement-amount"
              type="number"
              min=".01"
              step=".01"
              [(ngModel)]="value"
              [disabled]="busy"
              required
          /></label>
          <label
            >Fecha<input
              name="movement-date"
              type="date"
              [(ngModel)]="date"
              [disabled]="busy"
              required
          /></label>
          <label class="cash-concept"
            >Concepto<input
              name="movement-note"
              [(ngModel)]="note"
              maxlength="500"
              [disabled]="busy"
              placeholder="Ej.: aporte de efectivo o gasto de envío"
              required
          /></label>
        </div>
        <div class="purchase-footer">
          <small>Los pagos a proveedores se registran desde Compras.</small
          ><button
            class="purchase-save"
            appButton="primary"
            [disabled]="busy || !valid"
          >
            {{ busy ? "Guardando…" : "Registrar movimiento" }}
          </button>
        </div>
      </form>
    </section>
    <section class="catalog-panel purchase-panel">
      <div class="purchase-heading">
        <div>
          <h2>Movimientos</h2>
          <p>
            Últimos 100 registros. Las transferencias no son ingresos ni gastos.
          </p>
        </div>
        <app-select
          class="cash-history-filter"
          label="Filtrar cuenta"
          [(ngModel)]="filter"
          (ngModelChange)="loadHistory()"
          [options]="allAccountOptions"
        />
      </div>
      @if (!history.length) {
        <div class="purchase-empty">
          <strong>No hay movimientos registrados</strong>
          <p>Cuando registres un movimiento, aparecerá acá.</p>
        </div>
      }
      @for (m of history; track m.id) {
        <div class="cash-history-row">
          <div>
            <strong>{{ m.note }}</strong
            ><small
              >{{ m.occurred_on.split("-").reverse().join("/") }} ·
              {{ kindName(m.kind) }}</small
            >
          </div>
          <div>
            @for (e of m.entries; track e.account_id) {
              <p [class.cash-expense]="e.amount.startsWith('-')">
                <span>{{ e.account_name }}</span
                ><strong>{{ amount(e.amount, e.currency) }}</strong>
              </p>
            }
          </div>
        </div>
      }
    </section>`,
})
export class CashComponent implements OnInit {
  http = inject(HttpClient);
  cdr = inject(ChangeDetectorRef);
  accounts: any[] = [];
  history: any[] = [];
  error = "";
  notice = "";
  busy = false;
  creating = false;
  opening: any = null;
  openingValue = "";
  accountName = "";
  accountCurrency = "ARS";
  accountBalance = "";
  kind = "income";
  account: any = "";
  destination: any = "";
  value = "";
  note = "";
  date = this.today();
  filter: any = "";
  requestKey = crypto.randomUUID();
  currencies = [
    { value: "ARS", label: "ARS" },
    { value: "USD", label: "USD" },
  ];
  kinds = [
    { value: "income", label: "Ingreso" },
    { value: "expense", label: "Egreso" },
    { value: "transfer", label: "Transferencia entre cuentas" },
  ];
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  async ngOnInit() {
    await this.load();
  }
  async load() {
    try {
      this.accounts = await firstValueFrom(
        this.http.get<any[]>("/api/cash/accounts"),
      );
      await this.loadHistory();
    } catch (e: any) {
      this.error = e?.error?.message || "No se pudo cargar Caja";
    } finally {
      this.cdr.markForCheck();
    }
  }
  async loadHistory() {
    try {
      this.history = await firstValueFrom(
        this.http.get<any[]>("/api/cash/operations", {
          params: this.filter ? { account_id: this.filter } : {},
        }),
      );
    } catch (e: any) {
      this.error = e?.error?.message || "No se pudieron cargar los movimientos";
    } finally {
      this.cdr.markForCheck();
    }
  }
  get accountOptions() {
    return this.accounts
      .filter((a) => a.balance != null)
      .map((a) => ({
        value: a.id,
        label: a.name,
        detail: amountLabel(a.balance, a.currency),
      }));
  }
  get allAccountOptions() {
    return [
      { value: "", label: "Todas las cuentas" },
      ...this.accounts.map((a) => ({ value: a.id, label: a.name })),
    ];
  }
  get selectedAccount() {
    return this.accounts.find((a) => a.id === Number(this.account));
  }
  get destinationOptions() {
    return this.accounts
      .filter(
        (a) =>
          a.id !== Number(this.account) &&
          a.currency === this.selectedAccount?.currency &&
          a.balance != null,
      )
      .map((a) => ({ value: a.id, label: a.name }));
  }
  validAmount(v: any, zero = false) {
    try {
      const n = new Decimal(v);
      return (
        v !== "" &&
        n.isFinite() &&
        n.gte(zero ? 0 : 0.01) &&
        n.lte("1e15") &&
        n.decimalPlaces() <= 2
      );
    } catch {
      return false;
    }
  }
  validBalance(v: any) {
    try {
      const n = new Decimal(v);
      return (
        v !== "" &&
        n.isFinite() &&
        n.abs().lte("1e15") &&
        n.decimalPlaces() <= 2
      );
    } catch {
      return false;
    }
  }
  isNegative(v: any) {
    return v != null && new Decimal(v).lt(0);
  }
  get valid() {
    return (
      !!this.account &&
      !!this.date &&
      !!this.note.trim() &&
      this.validAmount(this.value) &&
      (this.kind !== "transfer" || !!this.destination)
    );
  }
  newKey() {
    this.requestKey = crypto.randomUUID();
  }
  kindName(k: string) {
    return this.kinds.find((x) => x.value === k)?.label || k;
  }
  amount = amountLabel;
  async mutate(path: string, body: any, method = "post") {
    this.busy = true;
    this.error = "";
    this.notice = "";
    try {
      const result = await firstValueFrom(
        method === "put"
          ? this.http.put(path, body)
          : this.http.post(path, body),
      );
      await this.load();
      return result;
    } catch (e: any) {
      this.error = e?.error?.message || "No se pudo guardar";
      return null;
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  async create() {
    if (
      this.busy ||
      !this.accountName.trim() ||
      !this.validBalance(this.accountBalance)
    )
      return;
    if (
      await this.mutate("/api/cash/accounts", {
        name: this.accountName,
        currency: this.accountCurrency,
        opening_balance: this.accountBalance,
      })
    ) {
      this.creating = false;
      this.accountName = "";
      this.accountBalance = "";
      this.notice = "Cuenta creada.";
    }
  }
  async saveOpening() {
    if (this.busy || !this.opening || !this.validBalance(this.openingValue))
      return;
    if (
      await this.mutate(
        "/api/cash/accounts/" + this.opening.id + "/opening-balance",
        { amount: this.openingValue },
        "put",
      )
    ) {
      this.opening = null;
      this.notice = "Saldo inicial cargado.";
    }
  }
  async save() {
    if (this.busy || !this.valid) return;
    if (
      await this.mutate("/api/cash/operations", {
        kind: this.kind,
        account_id: this.account,
        destination_id: this.destination,
        amount: this.value,
        note: this.note,
        occurred_on: this.date,
        request_key: this.requestKey,
      })
    ) {
      this.newKey();
      this.value = "";
      this.note = "";
      this.notice = "Movimiento registrado.";
    }
  }
}
function amountLabel(v: any, c: string) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: c,
    maximumFractionDigits: 2,
  }).format(Number(v));
}
