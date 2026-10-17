import { NextResponse } from "next/server";
import { simulation } from "@/lib/simulation";
import { getToken, isSimulation, sameOrigin } from "@/lib/upstream";
import type { Identity } from "@/lib/types";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };

async function handle(request: Request, context: Context) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  const { path } = await context.params;
  const route = path.join("/");
  const isProject = /^projects(?:\/[a-f0-9-]{36})?$/.test(route);
  if (!isProject && !["overview", "audit"].includes(route))
    return NextResponse.json({ error: "Unknown demo route" }, { status: 404 });
  if (request.method === "POST" && route !== "projects")
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });

  const selected = request.headers.get("x-demo-identity") ?? "writer";
  if (!["writer", "reader", "anonymous", "invalid"].includes(selected))
    return NextResponse.json({ error: "Unknown demo identity" }, { status: 400 });
  const identity = selected as Identity;
  let body: unknown;
  if (request.method === "POST") {
    const text = await request.text();
    if (text.length > 4096) return NextResponse.json({ error: "Body too large" }, { status: 413 });
    try { body = JSON.parse(text); }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  }
  const headers = { "Cache-Control": "no-store" };
  if (isSimulation()) {
    if (route === "overview") return NextResponse.json(simulation.overview(), { headers });
    if (route === "audit") return NextResponse.json(simulation.auditEvents(), { headers });
    const response = simulation.request(request.method, `/api/${route}`, identity, body);
    return NextResponse.json(response.body, { status: response.status, headers: response.headers });
  }
  try {
    const target = route === "overview" ? "/gateway/overview" : route === "audit" ? "/api/platform/audit" : `/api/${route}`;
    const token = !isProject ? await getToken("admin") : identity === "anonymous" ? null
      : identity === "invalid" ? "deliberately.invalid.token" : await getToken(identity);
    const upstream = await fetch(`${process.env.GATEWAY_URL ?? "http://localhost:8088"}${target}`, {
      method: request.method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    const text = await upstream.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = { message: text || upstream.statusText }; }
    if (route === "overview" && upstream.ok) data = { ...(data as object), mode: "live" };
    const forwarded: Record<string, string> = { ...headers };
    for (const name of ["x-request-id", "x-ratelimit-remaining", "x-ratelimit-burst-capacity", "x-ratelimit-replenish-rate", "retry-after"]) {
      const value = upstream.headers.get(name);
      if (value) forwarded[name] = value;
    }
    return NextResponse.json(data, { status: upstream.status, headers: forwarded });
  } catch {
    return NextResponse.json({ error: "upstream_unavailable",
      message: "Cannot reach the live stack. Start Docker Compose and check gateway / Keycloak health." },
      { status: 503, headers });
  }
}
export { handle as GET, handle as POST };
