import {
  Component,
  OnInit,
  inject,
  ChangeDetectorRef,
  Input,
  Output,
  EventEmitter,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { ButtonDirective } from "./ui/button";
interface Upload {
  file: File;
  state: string;
  error: string;
  busy: boolean;
}
@Component({
  selector: "app-media-library",
  standalone: true,
  imports: [FormsModule, ButtonDirective],
  template: ` <section
    class="media-library"
    aria-label="Biblioteca de imágenes"
  >
    <div class="media-toolbar">
      <div>
        <h2>Imágenes reutilizables</h2>
        <p>Subí JPG, PNG, GIF o WebP de hasta 5 MB por archivo.</p>
      </div>
      <label class="upload-button"
        >Subir imágenes<input
          aria-label="Subir imágenes"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          (change)="chooseFiles($event)"
      /></label>
    </div>
    @if (uploads.length) {
      <ul class="upload-queue" aria-live="polite">
        @for (u of uploads; track u) {
          <li>
            <span>{{ u.file.name }}</span
            ><strong>{{ u.state }}</strong>
            @if (u.error) {
              <span class="failure">{{ u.error }}</span
              ><button appButton (click)="send(u)" [disabled]="u.busy">
                Reintentar
              </button>
            }
          </li>
        }
      </ul>
    }
    <div class="media-tabs">
      <button
        appButton
        [attr.aria-pressed]="!sources"
        (click)="switchSource(false)"
      >
        Biblioteca</button
      ><button
        appButton
        [attr.aria-pressed]="sources"
        (click)="switchSource(true)"
      >
        Imágenes existentes
      </button>
    </div>
    @if (!sources) {
      <label class="media-search"
        >Buscar imágenes<input
          type="search"
          [(ngModel)]="search"
          (input)="searchChanged()"
          placeholder="Nombre de la imagen"
      /></label>
    } @else {
      <p>
        Incorporá una imagen para reutilizarla. La foto original del producto o
        proveedor se conserva.
      </p>
    }
    @if (error) {
      <div role="alert" class="failure">
        {{ error }}
        <button appButton (click)="load()">Volver a intentar</button>
      </div>
    }
    @if (loading) {
      <p role="status">Cargando imágenes…</p>
    } @else {
      @if (!items.length) {
        <div class="media-empty">
          {{
            sources
              ? "No hay imágenes existentes en esta página."
              : "No hay imágenes para mostrar. Subí archivos o incorporá imágenes existentes."
          }}
        </div>
      }
      <div class="media-grid">
        @for (item of items; track sources ? item.source + item.id : item.id) {
          <button
            type="button"
            class="media-card"
            [class.selected]="!sources && selected?.id === item.id"
            [attr.aria-pressed]="!sources && selected?.id === item.id"
            (click)="sources ? incorporate(item) : select(item)"
          >
            <span class="media-photo"
              ><img
                [src]="
                  sources ? '/api/images/' + item.image_key : item.thumbnail_url
                "
                [alt]="item.name"
                loading="lazy" /></span
            ><strong>{{ item.name }}</strong
            ><small>{{
              sources
                ? "Incorporar a la biblioteca"
                : item.width +
                  " × " +
                  item.height +
                  " · " +
                  item.usages.length +
                  " usos"
            }}</small>
          </button>
        }
      </div>
      <nav class="media-pagination" aria-label="Páginas de imágenes">
        <button
          appButton
          [disabled]="page === 1 || loading"
          (click)="page = page - 1; load()"
        >
          Anterior</button
        ><span
          >Página {{ page }}
          @if (!sources) {
            · {{ total }} imágenes
          }</span
        ><button
          appButton
          [disabled]="
            loading || (sources ? items.length < 24 : page * 24 >= total)
          "
          (click)="page = page + 1; load()"
        >
          Siguiente
        </button>
      </nav>
    }
    @if (selected && !sources) {
      <aside class="media-detail">
        <div>
          <h3>Imagen seleccionada</h3>
          <strong>{{ selected.name }}</strong>
          <p>
            {{ selected.mime }} · {{ (selected.bytes / 1024).toFixed(1) }} KB ·
            {{ selected.width }} × {{ selected.height }}
          </p>
          <a
            [href]="'/api/media/' + selected.id + '/file/original'"
            target="_blank"
            rel="noopener"
            >Ver original</a
          >
        </div>
        <div>
          <h4>Usos</h4>
          @if (!selected.usages.length) {
            <p>Esta imagen todavía no tiene asignaciones.</p>
          }
          @for (usage of selected.usages; track $index) {
            <p>{{ usage.label }} · {{ usage.slot }}</p>
          }
          @if (selectionMode) {
            <button appButton="primary" (click)="assetSelected.emit(selected)">
              Usar esta imagen
            </button>
          }
        </div>
      </aside>
    }
  </section>`,
  styles: [
    `
      :host {
        display: block;
      }
      .media-library {
        max-width: 1200px;
      }
      .media-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 24px;
      }
      h2 {
        font-size: 20px;
        margin: 0 0 8px;
      }
      p {
        color: var(--ink-2);
        line-height: 1.5;
      }
      .upload-button {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #11261f;
        color: white;
        border-radius: 8px;
        padding: 12px 18px;
        min-height: 44px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
      }
      .upload-button:focus-within {
        outline: 3px solid #9dff48;
        outline-offset: 3px;
      }
      .upload-button input {
        position: absolute;
        inset: 0;
        opacity: 0;
        width: 100%;
        cursor: pointer;
      }
      .media-tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 20px;
      }
      .media-tabs [aria-pressed="true"] {
        background: #11261f;
        color: white;
      }
      .media-search {
        display: grid;
        gap: 8px;
        max-width: 440px;
        margin-bottom: 24px;
        font-weight: 600;
      }
      .media-search input {
        width: 100%;
        min-height: 44px;
        padding: 10px;
        border: 1px solid var(--line);
        border-radius: 8px;
      }
      .media-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
        gap: 16px;
      }
      .media-card {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        text-align: left;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 10px;
        overflow: hidden;
        padding: 8px;
        gap: 9px;
        min-width: 0;
        cursor: pointer;
      }
      .media-card.selected {
        outline: 3px solid #11261f;
        outline-offset: 1px;
      }
      .media-card:focus-visible {
        outline: 3px solid #9dff48;
      }
      .media-photo {
        aspect-ratio: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f1f4f1;
        border-radius: 6px;
        overflow: hidden;
      }
      .media-photo img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      .media-card strong {
        overflow-wrap: anywhere;
        font-size: 14px;
      }
      .media-card small {
        color: var(--ink-2);
        font-size: 12px;
      }
      .media-pagination {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
        margin: 28px 0;
      }
      .media-pagination span {
        font-size: 13px;
      }
      .media-empty {
        padding: 48px 24px;
        text-align: center;
        border: 1px dashed var(--line);
        border-radius: 12px;
        background: var(--surface);
      }
      .media-detail {
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 20px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
        background: var(--surface);
      }
      .media-detail h3,
      .media-detail h4 {
        margin-top: 0;
      }
      .media-detail strong {
        overflow-wrap: anywhere;
      }
      .upload-queue {
        list-style: none;
        padding: 12px;
        margin-bottom: 20px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--surface);
      }
      .upload-queue li {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px;
        flex-wrap: wrap;
      }
      .upload-queue li > span:first-child {
        overflow-wrap: anywhere;
        min-width: 0;
        flex: 1;
      }
      .failure {
        color: #a31c2f;
        margin: 12px 0;
      }
      button {
        min-height: 44px;
      }
      @media (max-width: 600px) {
        .media-toolbar {
          align-items: stretch;
          flex-direction: column;
        }
        .media-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .media-detail {
          grid-template-columns: 1fr;
          gap: 12px;
        }
        .media-pagination {
          gap: 8px;
          flex-wrap: wrap;
        }
        .media-tabs {
          flex-wrap: wrap;
        }
      }
    `,
  ],
})
export class MediaLibraryComponent implements OnInit {
  @Input() selectionMode = false;
  @Output() assetSelected = new EventEmitter<any>();
  http = inject(HttpClient);
  cdr = inject(ChangeDetectorRef);
  items: any[] = [];
  selected: any;
  uploads: Upload[] = [];
  search = "";
  page = 1;
  total = 0;
  loading = false;
  error = "";
  sources = false;
  timer: any;
  sequence = 0;
  ngOnInit() {
    void this.load();
  }
  searchChanged() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.page = 1;
      void this.load();
    }, 250);
  }
  switchSource(value: boolean) {
    this.sources = value;
    this.page = 1;
    this.selected = null;
    void this.load();
  }
  async load() {
    const seq = ++this.sequence;
    this.loading = true;
    this.error = "";
    try {
      const result: any = await firstValueFrom(
        this.http.get(
          this.sources
            ? "/api/media/sources?page=" + this.page
            : "/api/media?page=" +
                this.page +
                "&search=" +
                encodeURIComponent(this.search),
        ),
      );
      if (seq !== this.sequence) return;
      this.items = this.sources ? result : result.items;
      this.total = result.total || 0;
    } catch {
      if (seq === this.sequence)
        this.error = "No se pudieron cargar las imágenes.";
    } finally {
      if (seq === this.sequence) this.loading = false;
      this.cdr.markForCheck();
    }
  }
  select(item: any) {
    this.selected = item;
  }
  chooseFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    for (const file of Array.from(input.files || [])) {
      const row = { file, state: "En espera", error: "", busy: false };
      this.uploads.push(row);
      void this.send(row);
    }
    input.value = "";
  }
  async send(row: Upload) {
    row.busy = true;
    row.error = "";
    row.state = "Subiendo…";
    try {
      if (row.file.size > 5 * 1024 * 1024)
        throw Error("La imagen debe pesar hasta 5 MB");
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(Error("No se pudo leer el archivo"));
        reader.readAsDataURL(row.file);
      });
      await firstValueFrom(
        this.http.post("/api/media", { name: row.file.name, data }),
      );
      row.state = "Guardada";
      if (!this.sources) await this.load();
    } catch (e: any) {
      row.state = "No se pudo subir";
      row.error =
        e.error?.message ||
        (e.status !== undefined
          ? "No se pudo subir. Revisá la conexión y volvé a intentar."
          : e.message) ||
        "Volvé a intentar.";
    } finally {
      row.busy = false;
      this.cdr.markForCheck();
    }
  }
  async incorporate(item: any) {
    this.error = "";
    try {
      const asset = await firstValueFrom(
        this.http.post("/api/media/import", {
          source: item.source,
          id: item.id,
        }),
      );
      this.sources = false;
      this.page = 1;
      this.search = "";
      this.selected = asset;
      await this.load();
    } catch (e: any) {
      this.error =
        e.error?.message ||
        "No se pudo incorporar la imagen. Volvé a intentar.";
    } finally {
      this.cdr.markForCheck();
    }
  }
}
