import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
} from "@nestjs/common";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { join, resolve } from "node:path";

@Injectable()
export class SupplierLogin implements OnModuleDestroy {
  private child?: ChildProcessWithoutNullStreams;
  private ready = false;
  private saved = false;
  private id = 0;
  private tail: Promise<any> = Promise.resolve();
  private pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: Error) => void }
  >();
  private expiry?: NodeJS.Timeout;
  private starting?: Promise<any>;
  status() {
    return {
      active: !!this.child,
      ready: this.ready,
      saved: this.saved,
      width: 1000,
      height: 720,
    };
  }
  async start() {
    if (this.starting) return this.starting;
    if (this.child) return this.status();
    this.starting = this.open();
    try {
      return await this.starting;
    } finally {
      this.starting = undefined;
    }
  }
  private async open() {
    const root = process.env.SCRAPER_ROOT || resolve(__dirname, "../../..");
    const child = spawn(
      process.env.PYTHON || join(root, ".venv/bin/python"),
      [join(root, "remote_login.py")],
      { cwd: root, stdio: ["pipe", "pipe", "pipe"] },
    );
    this.child = child;
    this.ready = this.saved = false;
    // Discard raw stderr: browser diagnostics may contain session URLs.
    child.stderr.resume();
    createInterface({ input: child.stdout }).on("line", (line) => {
      try {
        const result = JSON.parse(line),
          pending = this.pending.get(result.id);
        if (!pending) return;
        this.pending.delete(result.id);
        if (result.ok) pending.resolve(result);
        else
          pending.reject(
            new BadRequestException(
              result.id === 0
                ? "No se pudo abrir el navegador del proveedor."
                : "No se pudo completar la acción. Si estás guardando, primero completá el login de Coverweb.",
            ),
          );
      } catch {
        /* Never log browser output. */
      }
    });
    const cleanup = () => {
      if (this.child !== child) return;
      this.child = undefined;
      this.ready = false;
      clearTimeout(this.expiry);
      for (const p of this.pending.values())
        p.reject(
          new BadRequestException(
            "La ventana de login se cerró. Abrila nuevamente.",
          ),
        );
      this.pending.clear();
    };
    child.on("error", cleanup);
    child.on("exit", cleanup);
    child.stdin.on("error", cleanup);
    try {
      await this.response(0, 50000);
      this.ready = true;
      this.expiry = setTimeout(() => void this.cancel(), 10 * 60 * 1000);
      return this.status();
    } catch (e) {
      child.kill();
      cleanup();
      throw e;
    }
  }
  private response(id: number, ms = 15000) {
    return new Promise<any>((resolveResult, rejectResult) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectResult(
          new BadRequestException(
            "La acción tardó demasiado. Intentá nuevamente.",
          ),
        );
      }, ms);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolveResult(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          rejectResult(e);
        },
      });
    });
  }
  private request(body: any) {
    const run = async () => {
      if (!this.child || !this.ready)
        throw new BadRequestException("Primero abrí el login de Coverweb.");
      const id = ++this.id,
        result = this.response(id);
      this.child.stdin.write(JSON.stringify({ ...body, id }) + "\n");
      return result;
    };
    const next = this.tail.then(run, run);
    this.tail = next.catch(() => {});
    return next;
  }
  async frame() {
    const { image, authenticated } = await this.request({ op: "frame" });
    return { image, authenticated };
  }
  async action(body: any) {
    if (!body || !["click", "type", "key", "scroll"].includes(body.op))
      throw new BadRequestException("Acción inválida");
    const allowedKeys = [
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
      "Control+A",
    ];
    if (
      body.op === "type" &&
      (typeof body.text !== "string" || body.text.length > 500)
    )
      throw new BadRequestException("Texto inválido");
    if (body.op === "key" && !allowedKeys.includes(body.key))
      throw new BadRequestException("Tecla inválida");
    if (
      body.op === "click" &&
      (![body.x, body.y].every(Number.isFinite) ||
        body.x < 0 ||
        body.x > 1000 ||
        body.y < 0 ||
        body.y > 720)
    )
      throw new BadRequestException("Posición inválida");
    if (body.op === "scroll" && !Number.isFinite(body.delta))
      throw new BadRequestException("Desplazamiento inválido");
    await this.request(body);
    return { ok: true };
  }
  async complete() {
    await this.request({ op: "complete" });
    this.saved = true;
    this.child?.stdin.end();
    return { saved: true };
  }
  async cancel() {
    const child = this.child;
    if (!child) return { ok: true };
    try {
      if (this.ready) await this.request({ op: "cancel" });
    } catch {}
    child.stdin.end();
    const timer = setTimeout(() => child.kill(), 3000);
    timer.unref();
    return { ok: true };
  }
  async onModuleDestroy() {
    await this.cancel();
  }
}
