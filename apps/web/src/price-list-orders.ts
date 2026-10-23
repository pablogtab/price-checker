import {
  Component,
  EventEmitter,
  Output,
  inject,
  OnInit,
  ChangeDetectorRef,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
@Component({
  selector: "app-price-list-orders",
  standalone: true,
  imports: [FormsModule],
  template: `<section class="order-bar">
    <label
      >Entrega estimada
      <input
        type="number"
        min="1"
        max="365"
        aria-label="Entrega estimada (días)"
        [(ngModel)]="days"
        [disabled]="!ready || busy"
        (ngModelChange)="changed.emit()"
        (blur)="save()"
        (keydown.enter)="$event.preventDefault(); save()"
      />
      días</label
    >
    <small>Encargos compartidos entre todas las listas</small>
    @if (busy) {
      <span role="status">Guardando…</span>
    }
    @if (message) {
      <span role="alert"
        >{{ message }}
        @if (!ready) {
          <button type="button" (click)="load()">Reintentar</button>
        }
      </span>
    }
  </section>`,
  styles: [
    `
      .order-bar {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        margin: 16px 0;
        padding: 12px 16px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--surface);
      }
      label {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      input {
        width: 68px;
        height: 36px;
        padding: 6px;
        box-sizing: border-box;
      }
      small {
        color: var(--muted);
        font-size: 12px;
      }
      [role="alert"] {
        color: #a6472f;
        font-size: 12px;
      }
      @media (max-width: 760px) {
        .order-bar {
          align-items: flex-start;
        }
      }
    `,
  ],
})
export class PriceListOrdersComponent implements OnInit {
  @Output() changed = new EventEmitter<void>();
  http = inject(HttpClient);
  cdr = inject(ChangeDetectorRef);
  days = 7;
  products: any[] = [];
  busy = false;
  ready = false;
  message = "";
  private persisted: any = null;
  ngOnInit() {
    void this.load();
  }
  async load() {
    try {
      const p: any = await firstValueFrom(
        this.http.get("/api/price-list-order-policy"),
      );
      this.apply(p);
      this.ready = true;
      this.message = "";
      this.changed.emit();
    } catch {
      this.message = "No se pudieron cargar los encargos.";
    }
    this.cdr.markForCheck();
  }
  private apply(p: any) {
    this.days = p.days;
    this.products = p.products.map((x: any) => ({ ...x }));
    this.persisted = structuredClone(p);
  }
  allowed(id: number) {
    return this.products.some((p) => p.id === id && p.allowed);
  }
  allAllowed(ids: number[]) {
    return ids.length > 0 && ids.every((id) => this.allowed(id));
  }
  toggleProducts(ids: number[]) {
    if (!this.ready || this.busy) return;
    const allowed = !this.allAllowed(ids);
    this.products = this.products.map((p) =>
      ids.includes(p.id) ? { ...p, allowed } : p,
    );
    this.changed.emit();
    this.cdr.markForCheck();
    void this.save();
  }
  async save() {
    if (!this.ready || this.busy) return;
    const ids = this.products.filter((p) => p.allowed).map((p) => p.id);
    if (
      this.days === this.persisted.days &&
      JSON.stringify(ids) ===
        JSON.stringify(
          this.persisted.products
            .filter((p: any) => p.allowed)
            .map((p: any) => p.id),
        )
    )
      return;
    this.busy = true;
    this.message = "";
    this.changed.emit();
    this.cdr.markForCheck();
    try {
      const result = await firstValueFrom(
        this.http.put("/api/price-list-order-policy", {
          days: this.days,
          allowed_product_ids: ids,
        }),
      );
      this.apply(result);
    } catch {
      this.apply(this.persisted);
      this.message = "No se guardó el cambio. Intentá nuevamente.";
    } finally {
      this.busy = false;
      this.changed.emit();
      this.cdr.markForCheck();
    }
  }
}
