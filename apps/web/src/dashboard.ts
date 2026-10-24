import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  ChangeDetectorRef,
  inject,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { HttpClient, HttpParams } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { ButtonDirective } from "./ui/button";

interface Metrics {
  sales: string;
  profit: string | null;
  count: number;
  margin: string | null;
}
interface DailySales {
  date: string;
  sales: string;
  profit: string | null;
}
interface SalesReport {
  period: { start: string; end: string };
  previous_period: { start: string; end: string };
  current: Metrics;
  previous: Metrics;
  changes: {
    sales: string | null;
    profit: string | null;
    count: string | null;
    margin: string | null;
  };
  daily: DailySales[];
}

@Component({
  selector: "app-dashboard",
  standalone: true,
  imports: [FormsModule, ButtonDirective],
  templateUrl: "./dashboard.html",
  styleUrl: "./dashboard.css",
})
export class DashboardComponent implements OnChanges, OnDestroy {
  @Input() refreshToken: unknown;
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private sequence = 0;
  period = "last30";
  start = "";
  end = "";
  loading = false;
  error = "";
  report: SalesReport | null = null;
  salesPath = "";
  profitPath = "";
  ticks: { value: number; y: number }[] = [];
  labels: { date: string; x: number }[] = [];
  points: {
    day: DailySales;
    x: number;
    salesY: number;
    profitY: number | null;
  }[] = [];

  ngOnChanges() {
    void this.load();
  }
  ngOnDestroy() {
    ++this.sequence;
  }

  choosePeriod() {
    if (this.period === "custom") {
      this.start ||= this.report?.period.start || "";
      this.end ||= this.report?.period.end || "";
    }
    void this.load();
  }

  async load() {
    const sequence = ++this.sequence;
    this.error = "";
    if (
      this.period === "custom" &&
      (!this.start || !this.end || this.start > this.end)
    ) {
      this.loading = false;
      this.error =
        "Elegí una fecha de inicio y una fecha final igual o posterior.";
      this.cdr.markForCheck();
      return;
    }
    this.loading = true;
    let params = new HttpParams().set("period", this.period);
    if (this.period === "custom")
      params = params.set("start", this.start).set("end", this.end);
    try {
      const report = await firstValueFrom(
        this.http.get<SalesReport>("/api/sales/report", { params }),
      );
      if (sequence !== this.sequence) return;
      this.report = report;
      this.start = report.period.start;
      this.end = report.period.end;
      this.draw(report.daily);
    } catch (e: any) {
      if (sequence !== this.sequence) return;
      this.error =
        e?.error?.message ||
        "No se pudo cargar el progreso de ventas. Intentá nuevamente.";
    } finally {
      if (sequence === this.sequence) {
        this.loading = false;
        this.cdr.markForCheck();
      }
    }
  }

  money(value: string | number | null) {
    return value === null
      ? "—"
      : new Intl.NumberFormat("es-AR", {
          style: "currency",
          currency: "ARS",
          maximumFractionDigits: 2,
        }).format(Number(value));
  }
  percent(value: string | null) {
    return value === null
      ? "—"
      : new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(
          Number(value),
        ) + "%";
  }
  change(value: string | null, points = false) {
    if (value === null) return "—";
    const n = Number(value);
    return (
      (n > 0 ? "+" : "") +
      new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n) +
      (points ? " pp" : "%")
    );
  }
  direction(value: string | null) {
    return value === null
      ? ""
      : Number(value) > 0
        ? "positive"
        : Number(value) < 0
          ? "negative"
          : "";
  }
  date(value: string) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }
  shortDate(value: string) {
    return this.date(value).slice(0, 5);
  }
  axis(value: number) {
    return new Intl.NumberFormat("es-AR", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  private draw(days: DailySales[]) {
    const values = days.flatMap((day) =>
      day.profit === null
        ? [Number(day.sales)]
        : [Number(day.sales), Number(day.profit)],
    );
    const min = Math.min(0, ...values);
    const max = Math.max(1, ...values);
    const y = (value: number) => 240 - ((value - min) / (max - min)) * 210;
    this.points = days.map((day, i) => ({
      day,
      x: days.length === 1 ? 430 : 80 + (i / (days.length - 1)) * 700,
      salesY: y(Number(day.sales)),
      profitY: day.profit === null ? null : y(Number(day.profit)),
    }));
    this.salesPath = this.points
      .map((p, i) => `${i ? "L" : "M"}${p.x},${p.salesY}`)
      .join(" ");
    let gap = true;
    this.profitPath = this.points
      .map((p) => {
        if (p.profitY === null) {
          gap = true;
          return "";
        }
        const segment = `${gap ? "M" : "L"}${p.x},${p.profitY}`;
        gap = false;
        return segment;
      })
      .join(" ");
    this.ticks = [0, 1, 2, 3].map((i) => {
      const value = min + ((max - min) * i) / 3;
      return { value, y: y(value) };
    });
    const indices = [
      ...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1]),
    ];
    this.labels = indices
      .filter((i) => i >= 0)
      .map((i) => ({ date: days[i].date, x: this.points[i].x }));
  }
}
