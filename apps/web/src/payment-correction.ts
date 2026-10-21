import { ButtonDirective } from "./ui/button";
import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  ChangeDetectorRef,
  OnInit,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { A11yModule } from "@angular/cdk/a11y";
import { SelectComponent } from "./select";
@Component({
  selector: "app-payment-correction",
  standalone: true,
  imports: [FormsModule, A11yModule, SelectComponent, ButtonDirective],
  template: ` <div class="client-modal-backdrop">
    <section
      class="client-modal payment-correction"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-correction-title"
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
    >
      <h2 id="payment-correction-title">
        Corregir cobro · Venta #{{ sale.id }}
      </h2>
      <p>
        Solo se modifica esta aplicación de cobro. Los productos y otras ventas
        conservan sus valores.
      </p>
      <label
        >Importe (ARS)<input
          aria-label="Importe del cobro"
          type="number"
          min="0"
          step="0.01"
          [(ngModel)]="amount"
          (ngModelChange)="changed()"
      /></label>
      <label
        >Cuenta<app-select
          label="Cuenta del cobro"
          [options]="options"
          [(ngModel)]="account"
          (ngModelChange)="changed()"
      /></label>
      <label
        >Fecha<input
          aria-label="Fecha del cobro"
          type="date"
          [(ngModel)]="date"
          (ngModelChange)="changed()"
      /></label>
      @if (error) {
        <p class="alert danger" role="alert">{{ error }}</p>
      }
      @if (preview) {
        <div class="purchase-stock-preview">
          <h3>Revisá los cambios</h3>
          <p>
            Cobro: {{ money(preview.before.amount) }} →
            {{ money(preview.after.amount) }} ·
            {{ preview.before.occurred_on }} → {{ preview.after.occurred_on }}
          </p>
          @for (c of preview.cash; track c.account_id) {
            <p>{{ c.name }}: {{ money(c.before) }} → {{ money(c.after) }}</p>
          }
          <p>
            Pendiente de esta venta: {{ money(preview.before.pending) }} →
            {{ money(preview.after.pending) }}
          </p>
          <p>
            Deuda del cliente: {{ money(preview.customer_balance_before) }} →
            {{ money(preview.customer_balance_after) }}
          </p>
        </div>
      }
      <div class="client-modal-actions">
        <button appButton="ghost" [disabled]="busy" (click)="closed.emit()">
          Cancelar
        </button>
        @if (preview) {
          <button appButton="primary" [disabled]="busy" (click)="confirm()">
            Confirmar corrección
          </button>
        } @else {
          <button appButton="primary" [disabled]="busy" (click)="review()">
            Revisar corrección
          </button>
        }
      </div>
    </section>
  </div>`,
  styles: [
    `
      .client-modal-backdrop {
        position: fixed;
        inset: 0;
        background: #0006;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .payment-correction {
        background: white;
        border-radius: 16px;
        padding: 24px;
        width: 580px;
        max-width: 100%;
        max-height: 90dvh;
        overflow: auto;
      }
      .payment-correction label {
        display: grid;
        gap: 8px;
        margin: 16px 0;
      }
      .client-modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 24px;
      }
    `,
  ],
})
export class PaymentCorrectionComponent implements OnInit {
  @Input() sale: any;
  @Input() payment: any;
  @Input() accounts: any[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  amount = "";
  account: any = "";
  date = "";
  preview: any = null;
  busy = false;
  error = "";
  requestKey = crypto.randomUUID();
  ngOnInit() {
    this.amount = this.payment.amount;
    this.account = this.payment.account_id;
    this.date = this.payment.occurred_on;
  }
  get options() {
    return this.accounts
      .filter((a) => a.currency === "ARS" && a.balance != null)
      .map((a) => ({ value: a.id, label: a.name }));
  }
  money(v: any) {
    return Number(v).toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
    });
  }
  changed() {
    this.preview = null;
    this.requestKey = crypto.randomUUID();
    this.error = "";
  }
  body() {
    return {
      amount: String(this.amount),
      account_id: this.account,
      occurred_on: this.date,
    };
  }
  endpoint() {
    return "/api/sales/" + this.sale.id + "/payments/" + this.payment.id;
  }
  async review() {
    if (this.busy) return;
    this.busy = true;
    this.error = "";
    try {
      this.preview = await firstValueFrom(
        this.http.post(this.endpoint() + "/preview", this.body()),
      );
    } catch (e: any) {
      this.error = e.error?.message || "No se pudo revisar el cobro";
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  async confirm() {
    if (this.busy || !this.preview) return;
    this.busy = true;
    this.error = "";
    try {
      await firstValueFrom(
        this.http.post(this.endpoint() + "/corrections", {
          ...this.body(),
          preview_token: this.preview.preview_token,
          request_key: this.requestKey,
        }),
      );
      this.saved.emit();
    } catch (e: any) {
      this.error =
        e.error?.message ||
        "No se pudo confirmar. Podés reintentar sin duplicar la corrección.";
      if (e.status === 409) {
        this.preview = null;
        this.requestKey = crypto.randomUUID();
      }
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
}
