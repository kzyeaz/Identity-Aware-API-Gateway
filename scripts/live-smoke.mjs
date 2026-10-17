import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const gateway = process.env.GATEWAY_URL ?? "http://localhost:8088";
const issuer = process.env.KEYCLOAK_URL ?? "http://localhost:8180";
const results = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(url) {
  for (let attempt = 0; attempt < 90; attempt++) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(3000) })).ok) return; } catch {}
    await sleep(2000);
  }
  throw new Error(`Service did not become ready: ${url}`);
}
async function token(client, secret) {
  const response = await fetch(`${issuer}/realms/identity/protocol/openid-connect/token`, {
    method: "POST",
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: client, client_secret: secret }),
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200, `Token issuance for ${client}`);
  return (await response.json()).access_token;
}
async function call(path, jwt, method = "GET", body) {
  const start = performance.now();
  const response = await fetch(`${gateway}${path}`, {
    method, headers: { ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data, requestId: response.headers.get("x-request-id"), latencyMs: Math.round(performance.now() - start) };
}
function check(name, actual, expected) {
  assert.equal(actual, expected, name);
  results.push({ name, passed: true });
  console.log(`PASS ${name}`);
}

await waitFor(`${gateway}/actuator/health`);
await waitFor(`${issuer}/realms/identity/.well-known/openid-configuration`);
const writer = await token("demo-writer", process.env.WRITER_SECRET ?? "writer-local-only");
const reader = await token("demo-reader", process.env.READER_SECRET ?? "reader-local-only");
const admin = await token("console-admin", process.env.CONSOLE_SECRET ?? "console-local-only");
await sleep(2200); // Start with a replenished bucket, including when rerunning.
check("anonymous requests return 401", (await call("/api/projects")).status, 401);
check("malformed JWTs return 401", (await call("/api/projects", "invalid.jwt.token")).status, 401);
check("reader cannot write (403)", (await call("/api/projects", reader, "POST", { name: "blocked", description: "" })).status, 403);
check("developer cannot read operations data (403)", (await call("/gateway/overview", writer)).status, 403);
check("valid writer can read (200)", (await call("/api/projects", writer)).status, 200);
check("invalid payload returns 400", (await call("/api/projects", writer, "POST", { name: " ", description: "" })).status, 400);
const created = await call("/api/projects", writer, "POST", { name: `Smoke ${new Date().toISOString()}`, description: "End-to-end verification" });
check("project persists (201)", created.status, 201);
assert.ok(created.data.id);
check("owner reads created project (200)", (await call(`/api/projects/${created.data.id}`, writer)).status, 200);
check("another identity cannot read private project (404)", (await call(`/api/projects/${created.data.id}`, reader)).status, 404);
const audit = await call("/api/platform/audit", admin);
check("operations identity reads Mongo audit (200)", audit.status, 200);
check("audit correlates project and gateway request", audit.data.some(event => event.resource === created.data.id && event.requestId === created.requestId), true);
await sleep(2200);
const burst = await Promise.all(Array.from({ length: 30 }, () => call("/api/projects", writer)));
check("Redis rejects excess burst traffic (429)", burst.some(r => r.status === 429), true);
check("burst has no unexpected failures", burst.every(r => [200, 429].includes(r.status)), true);
check("another identity has its own bucket", (await call("/api/projects", reader)).status, 200);
const overview = await call("/gateway/overview", admin);
check("gateway accounts for rejected requests", overview.data.denied > 0 && overview.data.limited > 0, true);
const report = { recordedAt: new Date().toISOString(), gateway, checks: results, burst: {
  sent: burst.length, allowed: burst.filter(r => r.status === 200).length, limited: burst.filter(r => r.status === 429).length
}, note: "Functional smoke test, not a throughput benchmark or an uptime measurement." };
await writeFile(new URL("../artifacts/live-smoke.json", import.meta.url), JSON.stringify(report, null, 2));
console.log(`\n${results.length} checks passed. Evidence: artifacts/live-smoke.json`);
