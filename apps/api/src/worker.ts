import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { connect, db } from "./db";
import { processImage } from "./images";
import { importSnapshot } from "./catalog";
const root = process.env.SCRAPER_ROOT || resolve(__dirname, "../../..");
let stopping = false;
function argentinaNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
  };
}
export async function schedule(now = argentinaNow()) {
  if (now.hour >= 8)
    await db.query(
      "INSERT INTO refresh_runs(provider_id,status,trigger,scheduled_for) SELECT id,'queued','scheduled',$1::date FROM providers WHERE adapter='coverweb' ON CONFLICT DO NOTHING",
      [now.date],
    );
}
export async function processRun(
  run: any,
  scraperRoot = root,
  python = process.env.PYTHON || join(scraperRoot, ".venv/bin/python"),
) {
  const folder = await mkdtemp(join(tmpdir(), "price-checker-"));
  const output = join(folder, "snapshot.json");
  let progressWrites = Promise.resolve();
  let session = false;
  let timeout = false;
  const heartbeat = setInterval(
    () =>
      void db
        .query(
          "UPDATE refresh_runs SET heartbeat_at=now() WHERE id=$1 AND status='running'",
          [run.id],
        )
        .catch(() => {}),
    10000,
  );
  try {
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(
        python,
        [join(scraperRoot, "scraper.py"), "scrape", "--output", output],
        { cwd: scraperRoot, stdio: ["ignore", "pipe", "pipe"] },
      );
      const timer = setTimeout(
        () => {
          timeout = true;
          child.kill("SIGTERM");
        },
        30 * 60 * 1000,
      );
      // Inspect only for the session marker; never forward supplier tokens or raw output.
      let tail = "";
      const inspect = (buffer: Buffer) => {
        tail = (tail + buffer.toString()).slice(-4000);
        if (/session|login|loguead/i.test(tail)) session = true;
      };
      let lines = "";
      child.stdout.on("data", (buffer: Buffer) => {
        inspect(buffer);
        lines += buffer.toString();
        const complete = lines.split("\n");
        lines = complete.pop()!.slice(-4000);
        for (const line of complete) {
          const progress = parseProgress(
            line,
            Date.now() - Date.parse(run.started_at),
          );
          if (progress)
            progressWrites = progressWrites
              .then(async () => {
                await db.query(
                  "UPDATE refresh_runs SET progress=$1::jsonb WHERE id=$2 AND status='running'",
                  [JSON.stringify(progress), run.id],
                );
              })
              .catch(() => {});
        }
      });
      child.stderr.on("data", inspect);
      child.on("error", () => {
        clearTimeout(timer);
        reject(
          new Error(
            "No se pudo iniciar el scraper. Revisá la instalación de Python.",
          ),
        );
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        code === 0
          ? resolvePromise()
          : reject(
              new Error(
                timeout
                  ? "Se agotó el tiempo de actualización."
                  : session
                    ? "Renová la sesión de Coverweb desde Configuración."
                    : "El proveedor no pudo actualizarse. Se conserva el catálogo anterior.",
              ),
            );
      });
    });
    await progressWrites;
    await db.query(
      "UPDATE refresh_runs SET progress=COALESCE(progress,'{}'::jsonb)||$2::jsonb WHERE id=$1",
      [run.id, JSON.stringify({ phase: "importing", percent: 99 })],
    );
    const snapshot = JSON.parse(await readFile(output, "utf8"));
    await importSnapshot(snapshot, run.provider_id, run.id);
    console.log(`Actualización ${run.id}: ${snapshot.product_count} productos`);
  } catch {
    await db.query(
      "UPDATE refresh_runs SET status=$1,error=$2,finished_at=now() WHERE id=$3",
      [
        session ? "session_required" : "failed",
        session
          ? "Renová la sesión de Coverweb desde Configuración."
          : timeout
            ? "Se agotó el tiempo de actualización. Se conserva el catálogo anterior."
            : "El proveedor no pudo actualizarse o devolvió un catálogo inválido. Se conserva el catálogo anterior.",
        run.id,
      ],
    );
    console.log(
      `Actualización ${run.id}: ${session ? "sesión requerida" : "fallida"}`,
    );
  } finally {
    await progressWrites;
    clearInterval(heartbeat);
    await rm(folder, { recursive: true, force: true });
  }
}
export async function recoverInterrupted() {
  await db.query(
    "UPDATE refresh_runs SET status='queued',started_at=NULL,heartbeat_at=NULL,error=NULL,progress=NULL WHERE status='running'",
  );
}
export async function claimJob() {
  const [run] = await db.query(
    "WITH claimed AS (UPDATE refresh_runs SET status='running',started_at=now(),heartbeat_at=now() WHERE id=(SELECT id FROM refresh_runs WHERE status='queued' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *) SELECT * FROM claimed",
  );
  return run || null;
}
async function main() {
  await connect();
  const lock = db.createQueryRunner();
  await lock.connect();
  const [result] = await lock.query(
    "SELECT pg_try_advisory_lock(713451) locked",
  );
  if (!result.locked) {
    console.log("Otro worker está activo");
    await lock.release();
    await db.destroy();
    return;
  }
  try {
    await recoverInterrupted();
    while (!stopping) {
      await schedule();
      const run = await claimJob();
      if (run) await processRun(run);
      else if (await processImage())
        await new Promise((r) => setTimeout(r, 2500 + Math.random() * 500));
      else await new Promise((r) => setTimeout(r, 2000));
    }
  } finally {
    await lock.query("SELECT pg_advisory_unlock(713451)");
    await lock.release();
    await db.destroy();
  }
}
if (require.main === module) {
  process.on("SIGTERM", () => {
    stopping = true;
  });
  process.on("SIGINT", () => {
    stopping = true;
  });
  main().catch((e) => {
    console.error("Worker:", e.message);
    process.exit(1);
  });
}

export function parseProgress(line: string, elapsedMs: number) {
  const match = /^Page (\d+)\/(\d+): (\d+)\/(\d+) products$/.exec(line.trim());
  if (!match) return null;
  const [page, total_pages, products, reported_products] = match
    .slice(1)
    .map(Number);
  if (
    page < 1 ||
    total_pages < page ||
    reported_products < products ||
    !Number.isFinite(elapsedMs)
  )
    return null;
  return {
    phase: "scraping",
    page,
    total_pages,
    products,
    reported_products,
    percent: Math.min(98, Math.floor((page / total_pages) * 98)),
    remaining_seconds:
      page > 1
        ? Math.max(
            0,
            Math.ceil((elapsedMs / 1000 / (page - 1)) * (total_pages - page)),
          )
        : null,
    updated_at: new Date().toISOString(),
  };
}
