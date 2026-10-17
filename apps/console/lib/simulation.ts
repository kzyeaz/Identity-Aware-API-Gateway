import type { Audit, Identity, Overview, TrafficEvent } from "./types";

interface Project { id: string; owner: string; name: string; description: string; createdAt: string }
interface Bucket { tokens: number; updated: number }

/** Local presentation simulator, not a JWT implementation. The real policy runs in Spring. */
export class Simulation {
  private projects: Project[] = [];
  private audit: Audit[] = [];
  private events: TrafficEvent[] = [];
  private buckets = new Map<string, Bucket>();
  private total = 0;
  private allowed = 0;
  private denied = 0;
  private limited = 0;
  private startedAt = new Date().toISOString();

  constructor(private clock = () => Date.now()) {}

  overview(): Overview {
    const sorted = this.events.map(e => e.latencyMs).sort((a, b) => a - b);
    return { total: this.total, allowed: this.allowed, denied: this.denied, limited: this.limited,
      p95: sorted[Math.ceil(sorted.length * .95) - 1] ?? 0, events: [...this.events],
      startedAt: this.startedAt, mode: "simulation" };
  }

  auditEvents() { return [...this.audit]; }

  request(method: string, path: string, identity: Identity, body?: unknown): RequestResultInternal {
    const start = performance.now();
    const now = this.clock();
    const id = crypto.randomUUID();
    const headers: Record<string, string> = { "x-request-id": id, "cache-control": "no-store" };
    const finish = (status: number, responseBody: unknown) => {
      const event = { id, time: new Date(now).toISOString(), method, path, status,
        latencyMs: Math.round((performance.now() - start) * 100) / 100 };
      this.events = [event, ...this.events].slice(0, 100);
      this.total++;
      if (status >= 200 && status < 400) this.allowed++;
      if (status === 401 || status === 403) this.denied++;
      if (status === 429) this.limited++;
      return { status, body: responseBody, headers };
    };
    if (identity === "anonymous" || identity === "invalid")
      return finish(401, { error: "unauthorized", message: identity === "invalid" ? "Invalid bearer token" : "A bearer token is required" });
    if (method === "POST" && identity !== "writer")
      return finish(403, { error: "insufficient_scope", message: "Required scope: projects:write" });

    const bucket = this.buckets.get(identity) ?? { tokens: 10, updated: now };
    bucket.tokens = Math.min(10, bucket.tokens + Math.max(0, now - bucket.updated) / 1000 * 5);
    bucket.updated = now;
    this.buckets.set(identity, bucket);
    if (bucket.tokens < 1) {
      headers["x-ratelimit-remaining"] = "0";
      return finish(429, { error: "rate_limit_exceeded", message: "Bucket empty. Replenishes at 5 tokens/second." });
    }
    bucket.tokens--;
    headers["x-ratelimit-remaining"] = Math.floor(bucket.tokens).toString();
    headers["x-ratelimit-burst-capacity"] = "10";
    headers["x-ratelimit-replenish-rate"] = "5";

    if (method === "GET" && path === "/api/projects")
      return finish(200, this.projects.filter(p => p.owner === `demo-${identity}`).slice(0, 50));
    if (method === "GET") {
      const project = this.projects.find(p => p.id === path.split("/").pop() && p.owner === `demo-${identity}`);
      return project ? finish(200, project) : finish(404, { error: "not_found" });
    }
    const input = body as { name?: unknown; description?: unknown } | null;
    if (!input || typeof input.name !== "string" || !input.name.trim() || input.name.length > 80
      || typeof input.description !== "string" || input.description.length > 280)
      return finish(400, { error: "validation_failed", message: "Name: 1–80 characters. Description: up to 280 characters." });
    const project = { id: crypto.randomUUID(), owner: `demo-${identity}`, name: input.name.trim(),
      description: input.description.trim(), createdAt: new Date(now).toISOString() };
    this.projects.unshift(project);
    this.projects = this.projects.slice(0, 500);
    this.audit.unshift({ id: crypto.randomUUID(), actor: project.owner, action: "project.created",
      resource: project.id, requestId: id, time: project.createdAt });
    this.audit = this.audit.slice(0, 50);
    return finish(201, project);
  }
}

interface RequestResultInternal { status: number; body: unknown; headers: Record<string, string> }
const globalStore = globalThis as typeof globalThis & { identitySimulation?: Simulation };
export const simulation = globalStore.identitySimulation ??= new Simulation();
