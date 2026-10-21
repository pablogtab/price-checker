import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  ChangeDetectorRef,
  OnInit,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { A11yModule } from "@angular/cdk/a11y";
import { ButtonDirective } from "./ui/button";
@Component({
  selector: "app-sale-annulment",
  standalone: true,
  imports: [A11yModule, ButtonDirective],
  template: ` <div class="annul-backdrop">
    <section
      class="annul-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="annul-title"
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
    >
      <h2 id="annul-title">Anular venta #{{ sale.id }}</h2>
      <p>
        Se conserva el detalle histórico. Esta corrección solo modifica los
        registros de la app; no realiza transferencias bancarias.
      </p>
      @if (error) {
        <p class="alert danger" role="alert">{{ error }}</p>
      }
      @if (preview) {
        <h3>Revisá los efectos</h3>
        <p>
          Total activo: {{ money(preview.before.total) }} →
          {{ money(preview.after.total) }}
        </p>
        <p>
          Pendiente de la venta: {{ money(preview.before.pending) }} →
          {{ money(preview.after.pending) }}
        </p>
        <p>
          Deuda del cliente: {{ money(preview.customer_balance_before) }} →
          {{ money(preview.customer_balance_after) }}
        </p>
        <h3>Devolución al stock actual</h3>
        @for (s of preview.stock; track s.id) {
          <p>
            {{ s.name }}: {{ s.before }} → <strong>{{ s.after }}</strong> (+{{
              s.quantity
            }})
          </p>
        }
        <h3>Caja</h3>
        @for (c of preview.cash; track c.account_id) {
          <p>
            {{ c.name }}: {{ money(c.before) }} → {{ money(c.after) }} ({{
              money(c.delta)
            }})
          </p>
        } @empty {
          <p>Sin cobros para revertir.</p>
        }
        <p>
          Las aplicaciones de cobro de otras ventas se conservan. No se podrá
          reactivar esta venta.
        </p>
      }
      <div class="annul-actions">
        <button appButton="ghost" [disabled]="busy" (click)="closed.emit()">
          Cancelar
        </button>
        @if (preview) {
          <button appButton="primary" [disabled]="busy" (click)="confirm()">
            Confirmar anulación
          </button>
        } @else {
          <button appButton="outline" [disabled]="busy" (click)="review()">
            Revisar anulación
          </button>
        }
      </div>
    </section>
  </div>`,
  styles: [
    `
      .annul-backdrop {
        position: fixed;
        inset: 0;
        background: #0006;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .annul-dialog {
        background: white;
        border-radius: 16px;
        padding: 24px;
        width: 620px;
        max-width: 100%;
        max-height: 90dvh;
        overflow: auto;
      }
      .annul-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 24px;
        flex-wrap: wrap;
      }
    `,
  ],
})
export class SaleAnnulmentComponent implements OnInit {
  @Input() sale: any;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  preview: any = null;
  error = "";
  busy = false;
  requestKey = crypto.randomUUID();
  ngOnInit() {
    void this.review();
  }
  money(v: any) {
    return Number(v).toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
    });
  }
  async review() {
    if (this.busy) return;
    this.busy = true;
    this.error = "";
    try {
      this.preview = await firstValueFrom(
        this.http.post("/api/sales/" + this.sale.id + "/annul/preview", {}),
      );
    } catch (e: any) {
      this.error = e.error?.message || "No se pudo revisar la anulación";
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
        this.http.post("/api/sales/" + this.sale.id + "/annul", {
          preview_token: this.preview.preview_token,
          request_key: this.requestKey,
        }),
      );
      this.saved.emit();
    } catch (e: any) {
      this.error =
        e.error?.message ||
        "No se pudo confirmar. Podés reintentar sin duplicar efectos.";
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
