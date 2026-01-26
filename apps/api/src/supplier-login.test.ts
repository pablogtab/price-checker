import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SupplierLogin } from "./supplier-login";

test("remote login serializes actions, saves only after authentication, and discards diagnostics", async () => {
  const folder = await mkdtemp(join(tmpdir(), "price-checker-login-test-"));
  const oldRoot = process.env.SCRAPER_ROOT,
    oldPython = process.env.PYTHON;
  process.env.SCRAPER_ROOT = folder;
  process.env.PYTHON = "python3";
  const service = new SupplierLogin();
  try {
    await writeFile(
      join(folder, "remote_login.py"),
      `import sys,json,os
open(os.path.join(os.path.dirname(__file__),'starts'),'a').write('1')
print(json.dumps({'id':0,'ok':True}),flush=True)
authenticated=False
for line in sys.stdin:
 r=json.loads(line); op=r['op']; result={'id':r['id'],'ok':True}
 if op=='type': authenticated=r['text']=='finish'
 if op=='frame': result.update({'authenticated':authenticated,'image':None if authenticated else 'aGVsbG8='})
 if op=='complete': result.update({'ok':authenticated,'saved':authenticated})
 print('DO_NOT_EXPOSE_TOKEN_OR_PASSWORD',file=sys.stderr,flush=True)
 print(json.dumps(result),flush=True)
 if op=='cancel' or (op=='complete' and authenticated): break
`,
    );
    const statuses = await Promise.all([
      service.start(),
      service.start(),
      service.start(),
    ]);
    assert(statuses.every((s) => s.active && s.ready));
    assert.equal(await readFile(join(folder, "starts"), "utf8"), "1");
    assert.deepEqual(await service.frame(), {
      image: "aGVsbG8=",
      authenticated: false,
    });
    await assert.rejects(
      service.complete(),
      (e) => !String(e).includes("DO_NOT_EXPOSE"),
    );
    await assert.rejects(service.action({ op: "click", x: -1, y: 0 }));
    await assert.rejects(service.action({ op: "key", key: "arbitrary" }));
    await assert.rejects(service.action({ op: "type", text: "x".repeat(501) }));
    await Promise.all([
      service.action({ op: "type", text: "first" }),
      service.action({ op: "type", text: "finish" }),
    ]);
    assert.deepEqual(await service.frame(), {
      image: null,
      authenticated: true,
    });
    assert.deepEqual(await service.complete(), { saved: true });
    assert(!JSON.stringify(service.status()).includes("DO_NOT_EXPOSE"));
  } finally {
    await service.cancel();
    if (oldRoot === undefined) delete process.env.SCRAPER_ROOT;
    else process.env.SCRAPER_ROOT = oldRoot;
    if (oldPython === undefined) delete process.env.PYTHON;
    else process.env.PYTHON = oldPython;
    await rm(folder, { recursive: true, force: true });
  }
});
