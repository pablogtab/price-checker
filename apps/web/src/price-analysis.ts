import { ButtonDirective } from "./ui/button";
import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  inject,
  ChangeDetectorRef,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { HttpClient, HttpParams } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { SelectComponent } from "./select";
@Component({
  selector: "price-analysis",
  standalone: true,
  imports: [FormsModule, SelectComponent, ButtonDirective],
  template: ` <section class="price-review" aria-label="Diferencias de precios">
    <div class="review-heading">
      <div>
        <h3>Diferencias de precios</h3>
        @if (run.price_analysis.baseline) {
          <p>
            Primera lista: se guardó como referencia para la próxima
            comparación.
          </p>
        } @else {
          <p>
            <strong class="up">{{ run.price_analysis.increased }} subas</strong>
            ·
            <strong class="down"
              >{{ run.price_analysis.decreased }} bajas</strong
            >
            · {{ run.price_analysis.currency_changed }} cambios de moneda
          </p>
        }
        <small
          >{{ run.provider_name }} · {{ date(run.finished_at) }} ·
          {{ run.price_analysis.added }} nuevos o recuperados ·
          {{ run.price_analysis.unavailable }} no disponibles ·
          {{ run.price_analysis.stock_changed }} cambios de stock</small
        >
      </div>
      @if (!run.price_analysis.baseline) {
        <button
          appButton
          type="button"
          (click)="toggle()"
          [attr.aria-expanded]="open"
        >
          {{ open ? "Ocultar diferencias" : "Ver diferencias" }}
        </button>
      }
    </div>
    @if (open) {
      <div class="review-filters">
        <input
          type="search"
          aria-label="Buscar diferencias de precios"
          placeholder="Nombre, código o código de barras…"
          [(ngModel)]="search"
          (ngModelChange)="filter()"
        />
        <app-select
          label="Tipo de cambio de precio"
          [options]="directions"
          [(ngModel)]="direction"
          (ngModelChange)="filter()"
        />
      </div>
      <p class="review-note">
        Precios del proveedor, en su moneda original. No modifica tus precios de
        venta.
      </p>
      @if (error) {
        <p role="alert">
          {{ error }} <button appButton (click)="load()">Reintentar</button>
        </p>
      } @else if (loading) {
        <p role="status">Cargando diferencias…</p>
      } @else {
        <div class="review-scroll">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Anterior</th>
                <th>Nuevo</th>
                <th>Diferencia</th>
                <th>Variación</th>
              </tr>
            </thead>
            <tbody>
              @for (c of data.items; track c.external_id) {
                <tr>
                  <td>
                    <strong>{{ c.name }}</strong
                    ><small
                      >{{ c.internal_code || c.external_id }}
                      @if (c.barcode) {
                        · {{ c.barcode }}
                      }
                    </small>
                  </td>
                  <td>{{ money(c.old_price, c.old_currency) }}</td>
                  <td>{{ money(c.new_price, c.new_currency) }}</td>
                  <td
                    [class.up]="c.direction === 'up'"
                    [class.down]="c.direction === 'down'"
                  >
                    {{
                      c.direction === "currency"
                        ? "Cambio de moneda"
                        : signedMoney(c.delta, c.new_currency)
                    }}
                  </td>
                  <td
                    [class.up]="c.direction === 'up'"
                    [class.down]="c.direction === 'down'"
                  >
                    {{ percent(c.percent) }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (!data.total) {
          <p>
            No hay diferencias de precio{{
              search || direction !== "all" ? " para estos filtros" : ""
            }}.
          </p>
        }
        <div class="review-pagination">
          <span>{{ data.total }} cambios</span
          ><button
            appButton
            aria-label="Página anterior de diferencias"
            [disabled]="page <= 1"
            (click)="page = page - 1; load()"
          >
            ←</button
          ><span>{{ page }} / {{ pages }}</span
          ><button
            appButton
            aria-label="Página siguiente de diferencias"
            [disabled]="page >= pages"
            (click)="page = page + 1; load()"
          >
            →
          </button>
        </div>
      }
    }
  </section>`,
  styles: [
    `
      :host {
        display: block;
        margin: 16px 0;
      }
      .price-review {
        background: white;
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 20px;
        min-width: 0;
      }
      .review-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }
      .review-heading h3 {
        margin: 0 0 8px;
      }
      .review-heading p {
        margin: 0 0 8px;
      }
      .review-heading small,
      .review-note {
        color: var(--muted);
      }
      .review-filters {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(180px, 1fr);
        gap: 12px;
        margin-top: 20px;
      }
      .review-filters input {
        width: 100%;
        box-sizing: border-box;
      }
      .review-scroll {
        overflow: auto;
      }
      .review-scroll table {
        min-width: 680px;
        width: 100%;
        border-collapse: collapse;
      }
      .review-scroll th,
      .review-scroll td {
        padding: 12px;
        text-align: left;
        border-bottom: 1px solid var(--border);
      }
      .review-scroll td:not(:first-child) {
        white-space: nowrap;
      }
      .review-scroll td small {
        display: block;
        margin-top: 6px;
        color: var(--muted);
      }
      .up {
        color: #ab3b29;
      }
      .down {
        color: #287149;
      }
      .review-pagination {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        align-items: center;
        margin-top: 16px;
      }
      @media (max-width: 760px) {
        .review-heading {
          align-items: flex-start;
          flex-direction: column;
        }
        .review-filters {
          grid-template-columns: 1fr;
        }
        .price-review {
          padding: 16px;
        }
      }
    `,
  ],
})
export class PriceAnalysisComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) run: any;
  http = inject(HttpClient);
  cdr = inject(ChangeDetectorRef);
  open = false;
  loading = false;
  error = "";
  search = "";
  direction = "all";
  page = 1;
  data: any = { items: [], total: 0 };
  private request = 0;
  private timer: any;
  directions = [
    { value: "all", label: "Todas las diferencias" },
    { value: "up", label: "Solo subas" },
    { value: "down", label: "Solo bajas" },
    { value: "currency", label: "Cambios de moneda" },
  ];
  ngOnChanges(changes: SimpleChanges) {
    if (changes["run"]?.previousValue?.id !== this.run.id) {
      clearTimeout(this.timer);
      this.request++;
      this.page = 1;
      this.data = { items: [], total: 0 };
      if (this.open) void this.load();
    }
  }
  ngOnDestroy() {
    clearTimeout(this.timer);
    this.request++;
  }
  get pages() {
    return Math.max(1, Math.ceil(this.data.total / 30));
  }
  toggle() {
    this.open = !this.open;
    if (this.open) void this.load();
  }
  filter() {
    this.page = 1;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(), 200);
  }
  async load() {
    const request = ++this.request;
    this.loading = true;
    this.error = "";
    try {
      const params = new HttpParams()
        .set("search", this.search)
        .set("direction", this.direction)
        .set("page", this.page);
      const data = await firstValueFrom(
        this.http.get("/api/refresh-runs/" + this.run.id + "/changes", {
          params,
        }),
      );
      if (request === this.request) this.data = data;
    } catch (e: any) {
      if (request === this.request)
        this.error =
          e?.error?.message || "No se pudieron cargar las diferencias";
    } finally {
      if (request === this.request) {
        this.loading = false;
        this.cdr.markForCheck();
      }
    }
  }
  date(value: any) {
    return new Date(value).toLocaleString("es-AR");
  }
  money(value: any, currency: string) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "USD" ? 4 : 2,
    }).format(Number(value));
  }
  signedMoney(value: any, currency: string) {
    return (Number(value) > 0 ? "+" : "") + this.money(value, currency);
  }
  percent(value: any) {
    return value == null
      ? "—"
      : (Number(value) > 0 ? "+" : "") +
          new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(
            Number(value),
          ) +
          "%";
  }
}
