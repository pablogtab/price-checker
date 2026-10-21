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
          {{ r.kind.startsWith("payment:") ? "Corrección de cobro" : r.kind }} ·
          {{ describe(r.before_state) }} → {{ describe(r.after_state) }}
        </p>
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
