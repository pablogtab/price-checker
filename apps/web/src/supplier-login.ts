import {
  Component,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
  inject,
  signal,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { A11yModule } from "@angular/cdk/a11y";
import { firstValueFrom } from "rxjs";

@Component({
  selector: "supplier-login",
  standalone: true,
  imports: [FormsModule, A11yModule],
  template: ` <div class="modal-overlay">
    <section
      class="login-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="supplier-login-title"
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
    >
      <header>
        <div>
          <h2 id="supplier-login-title">Renovar sesión de Coverweb</h2>
          <p>
            Este navegador es temporal. Completá el login y cualquier CAPTCHA;
            después guardá la sesión.
          </p>
        </div>
        <button type="button" aria-label="Cerrar login" (click)="close()">
          ×
        </button>
      </header>
      @if (error()) {
        <div class="alert danger" role="alert">{{ error() }}</div>
      }
      @if (opening()) {
        <p role="status">Abriendo el navegador del proveedor…</p>
      }
      @if (authenticated()) {
        <div class="alert" role="status">
          Coverweb confirmó el inicio de sesión. Ya podés guardarla.
        </div>
      } @else if (image()) {
        <img
          class="remote-browser"
          [src]="image()"
          alt="Navegador de Coverweb. Tocá un campo, escribí abajo y usá Escribir; también podés completar el CAPTCHA tocando la imagen."
          tabindex="0"
          (click)="clickBrowser($event)"
          (keydown)="keyBrowser($event)"
          (wheel)="scrollBrowser($event)"
        />
      }
      @if (!authenticated() && !opening()) {
        <form class="login-input" (ngSubmit)="typeText()">
          <label for="remote-text">Texto para el campo seleccionado</label>
          <div>
            <input
              id="remote-text"
              name="remote-text"
              [type]="showText ? 'text' : 'password'"
              [(ngModel)]="text"
              autocomplete="off"
              maxlength="500"
              placeholder="Primero tocá el campo en el navegador"
            /><button type="submit" [disabled]="!text || busy()">
              Escribir
            </button>
          </div>
          <label class="show-text"
            ><input type="checkbox" name="show-text" [(ngModel)]="showText" />
            Mostrar texto</label
          >
        </form>
        <div class="login-tools">
          <button (click)="action({ op: 'key', key: 'Tab' })">
            Siguiente campo</button
          ><button (click)="action({ op: 'key', key: 'Control+A' })">
            Seleccionar texto</button
          ><button (click)="action({ op: 'key', key: 'Backspace' })">
            Borrar</button
          ><button (click)="action({ op: 'key', key: 'Enter' })">Enter</button
          ><button (click)="action({ op: 'scroll', delta: -500 })">
            Subir página</button
          ><button (click)="action({ op: 'scroll', delta: 500 })">
            Bajar página
          </button>
        </div>
      }
      <small
        >La contraseña no se guarda ni se registra. La ventana se cierra a los
        10 minutos.</small
      >
      <footer>
        <button (click)="close()">Cancelar</button
        ><button
          class="save-login"
          [disabled]="!authenticated() || busy()"
          (click)="save()"
        >
          Guardar sesión
        </button>
      </footer>
    </section>
  </div>`,
  styles: [
    `
      .modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #102b2666;
        padding: 10px;
      }
      .login-dialog {
        width: 1050px;
        max-width: 95vw;
        max-height: 94vh;
        overflow: auto;
        background: white;
        border-radius: 18px;
        padding: 22px;
        box-sizing: border-box;
      }
      header {
        display: flex;
        gap: 15px;
        align-items: flex-start;
        justify-content: space-between;
      }
      h2 {
        margin: 0 0 8px;
      }
      p {
        margin: 0 0 15px;
        color: #657365;
      }
      button {
        cursor: pointer;
        border: 1px solid #d9e1d5;
        background: #f5f7f1;
        border-radius: 8px;
        padding: 10px 14px;
        color: #163e32;
        font: inherit;
      }
      button:disabled {
        opacity: 0.4;
        cursor: default;
      }
      .remote-browser {
        display: block;
        width: auto;
        max-width: 100%;
        max-height: 55vh;
        margin: 0 auto;
        height: auto;
        border: 1px solid #d9e1d5;
        cursor: pointer;
        touch-action: none;
      }
      .remote-browser:focus {
        outline: 2px solid #44765c;
      }
      .login-input {
        margin: 15px 0;
      }
      .login-input > label {
        display: block;
        margin-bottom: 6px;
      }
      .login-input > div {
        display: flex;
        gap: 8px;
      }
      .login-input input:not([type="checkbox"]) {
        flex: 1;
        min-width: 0;
        padding: 12px;
        border: 1px solid #d9e1d5;
        border-radius: 8px;
        font: inherit;
      }
      .show-text {
        margin-top: 10px;
        font-size: 13px;
      }
      .login-tools {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 14px;
      }
      .login-tools button {
        font-size: 13px;
        padding: 8px;
      }
      small {
        color: #657365;
      }
      footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 16px;
      }
      .save-login {
        background: #163e32;
        color: white;
      }
      @media (max-width: 760px) {
        .login-dialog {
          padding: 14px;
          border-radius: 12px;
        }
        .login-input > div {
          flex-wrap: wrap;
        }
        .login-input > div button {
          width: 100%;
        }
        h2 {
          font-size: 20px;
        }
      }
    `,
  ],
})
export class SupplierLoginComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();
  image = signal("");
  opening = signal(true);
  authenticated = signal(false);
  error = signal("");
  busy = signal(false);
  text = "";
  showText = false;
  private timer?: ReturnType<typeof setTimeout>;
  private destroyed = false;
  private completed = false;
  private actionTail: Promise<void> = Promise.resolve();
  async ngOnInit() {
    try {
      await this.post("start", {});
      this.opening.set(false);
      await this.frame();
    } catch {
      this.opening.set(false);
      this.error.set(
        "No se pudo abrir Coverweb. Cerrá esta ventana e intentá nuevamente.",
      );
    }
  }
  private post(path: string, body: any) {
    return firstValueFrom(this.http.post("/api/supplier-login/" + path, body));
  }
  private async frame() {
    if (this.destroyed) return;
    try {
      const result: any = await firstValueFrom(
        this.http.get("/api/supplier-login/frame"),
      );
      if (this.destroyed) return;
      this.authenticated.set(result.authenticated);
      this.image.set(
        result.image ? "data:image/png;base64," + result.image : "",
      );
      if (!result.authenticated)
        this.timer = setTimeout(() => void this.frame(), 1200);
    } catch {
      if (!this.destroyed)
        this.error.set(
          "La ventana se cerró o perdió conexión. Cerrala y abrila nuevamente.",
        );
    }
  }
  async action(body: any) {
    const run = async () => {
      if (this.authenticated() || this.destroyed) return;
      this.busy.set(true);
      this.error.set("");
      try {
        await this.post("action", body);
      } catch {
        this.error.set("No se pudo completar esa acción. Intentá nuevamente.");
      } finally {
        this.busy.set(false);
      }
    };
    this.actionTail = this.actionTail.then(run, run);
    await this.actionTail;
  }
  clickBrowser(event: MouseEvent) {
    const bounds = (
      event.currentTarget as HTMLImageElement
    ).getBoundingClientRect();
    void this.action({
      op: "click",
      x: ((event.clientX - bounds.left) * 1000) / bounds.width,
      y: ((event.clientY - bounds.top) * 720) / bounds.height,
    });
    (event.currentTarget as HTMLImageElement).focus();
  }
  keyBrowser(event: KeyboardEvent) {
    event.preventDefault();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a")
      void this.action({ op: "key", key: "Control+A" });
    else if (
      [
        "Tab",
        "Enter",
        "Backspace",
        "Delete",
        "Escape",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
      ].includes(event.key)
    )
      void this.action({ op: "key", key: event.key });
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey)
      void this.action({ op: "type", text: event.key });
  }
  scrollBrowser(event: WheelEvent) {
    event.preventDefault();
    void this.action({
      op: "scroll",
      delta: Math.max(-720, Math.min(720, event.deltaY)),
    });
  }
  async typeText() {
    const value = this.text;
    this.text = "";
    await this.action({ op: "type", text: value });
  }
  async save() {
    this.busy.set(true);
    this.error.set("");
    try {
      await this.post("complete", {});
      this.completed = true;
      this.saved.emit();
    } catch {
      this.error.set(
        "Primero completá el login de Coverweb y cualquier CAPTCHA pendiente.",
      );
    } finally {
      this.busy.set(false);
    }
  }
  close() {
    this.closed.emit();
  }
  ngOnDestroy() {
    this.destroyed = true;
    this.text = "";
    clearTimeout(this.timer);
    if (!this.completed) void this.post("cancel", {}).catch(() => {});
  }
}
