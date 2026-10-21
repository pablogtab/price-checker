import { ButtonDirective } from "./ui/button";
import { Component, Input, inject, ChangeDetectorRef } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
@Component({
  selector: "app-sale-correction-history",
  standalone: true,
  imports: [ButtonDirective],
  template: `<button appButton="ghost" (click)="load()">
      Ver correcciones
    </button>
    @if (error) {
      <p role="alert">{{ error }}</p>
    }
    @if (rows) {
      @for (r of rows; track r.id) {
        <p class="purchase-help">
          {{ r.created_at }} ·
          {{
            r.kind.startsWith("payment:")
              ? "Corrección de cobro"
              : r.kind === "annul"
                ? "Anulación de venta"
                : r.kind
          }}
          · {{ describe(r.before_state) }} → {{ describe(r.after_state) }}
        </p>
        @if (r.kind === "annul") {
          @for (p of r.before_state.payments; track p.id) {
            <p class="purchase-help">
              Cobro revertido: {{ describe(p) }} · origen #{{ p.operation_id }}
            </p>
          }
          @for (c of r.before_state.components; track c.id) {
            <p class="purchase-help">
              Devuelto al stock: {{ c.quantity }} × {{ c.product_name }}
            </p>
          }
        }
      } @empty {
        <p class="purchase-help">Sin correcciones registradas.</p>
      }
    }`,
})
export class SaleCorrectionHistoryComponent {
  @Input() saleId!: number;
  rows: any[] | null = null;
  error = "";
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  describe(s: any) {
    if (s.status)
      return (
        (s.status === "annulled" ? "Anulada" : "Activa") +
        " · Total activo: " +
        Number(s.total).toLocaleString("es-AR", {
          style: "currency",
          currency: "ARS",
        })
      );
    if (s.total != null)
      return (
        "Total: " +
        Number(s.total).toLocaleString("es-AR", {
          style: "currency",
          currency: "ARS",
        }) +
        " · " +
        (s.sold_on || "") +
        " · " +
        (s.customer_name ||
          (s.customer_id ? "Cliente #" + s.customer_id : "Consumidor final"))
      );
    if (s.amount == null) return JSON.stringify(s);
    return (
      Number(s.amount).toLocaleString("es-AR", {
        style: "currency",
        currency: "ARS",
      }) +
      " · Cuenta #" +
      s.account_id +
      " · " +
      s.occurred_on
    );
  }
  async load() {
    try {
      this.rows = await firstValueFrom(
        this.http.get<any[]>("/api/sales/" + this.saleId + "/corrections"),
      );
    } catch {
      this.error = "No se pudo cargar el historial de correcciones";
    }
    this.cdr.markForCheck();
  }
}
