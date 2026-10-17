"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity, ArrowDown, ArrowRight, ArrowUpRight, Blocks, BookOpen, Check, CheckCheck,
  ChevronDown, ChevronRight, Circle, Clock3, Code2, Copy, Database, Fingerprint,
  Gauge, GitBranch, Layers3, LoaderCircle, LockKeyhole, Menu, Network, Play,
  Radio, RefreshCw, Search, Server, Shield, ShieldCheck, Terminal, X, Zap,
} from "lucide-react";
import type { Audit, Identity, Overview, Page, RequestResult, TrafficEvent } from "@/lib/types";

const navigation: { name: Page; icon: typeof Shield }[] = [
  { name: "Overview", icon: Blocks }, { name: "API playground", icon: Terminal },
  { name: "Audit trail", icon: Activity }, { name: "Architecture", icon: Network },
  { name: "Developer SDK", icon: Code2 },
];
const sdkExample = `import { IdentityClient, GatewayError } from "@identity/sdk";

const gateway = new IdentityClient({
  baseUrl: "http://localhost:8088",
  token: async () => accessToken, // your OIDC token provider
});

try {
  const project = await gateway.createProject({
    name: "My first integration",
    description: "Built behind an identity-aware gateway",
  });
  console.log(project.id);
} catch (error) {
  if (error instanceof GatewayError) {
    console.log(error.status, error.requestId);
  }
}`;
const curlExample = `# Obtain a local demo token (Node.js 20+ example in scripts/sdk-demo.mjs)
curl -X POST http://localhost:8180/realms/identity/protocol/openid-connect/token \\
  -d grant_type=client_credentials \\
  -d client_id=demo-writer \\
  -d client_secret=writer-local-only

# Copy access_token from the response
curl http://localhost:8088/api/projects \\
  -H "Authorization: Bearer <access_token>"`;

async function sendRequest(identity: Identity, method = "GET", body?: string): Promise<RequestResult> {
  const start = performance.now();
  const response = await fetch("/api/bridge/projects", {
    method, headers: { "x-demo-identity": identity, ...(body ? { "Content-Type": "application/json" } : {}) }, body,
  });
  const data = await response.json();
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    if (key.startsWith("x-") || key === "retry-after") headers[key] = value;
  });
  return { status: response.status, body: data, headers, latency: Math.round(performance.now() - start) };
}

function Status({ code }: { code: number }) {
  return <span className={`status-code ${code < 400 ? "success" : code === 429 ? "warning" : "danger"}`}><i />{code}</span>;
}
function Empty({ icon: Icon = Radio, title, text }: { icon?: typeof Shield; title: string; text: string }) {
  return <div className="empty"><Icon size={25} /><strong>{title}</strong><span>{text}</span></div>;
}
function PanelTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return <div className="panel-title"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{children}</div>;
}
function EventTable({ events, compact = false }: { events: TrafficEvent[]; compact?: boolean }) {
  return <div className="table-scroll"><table><thead><tr><th>Request</th><th>Status</th><th>Latency</th><th>Time</th>{!compact && <th>Request ID</th>}</tr></thead>
    <tbody>{events.map(event => <tr key={event.id}>
      <td><span className={`method ${event.method.toLowerCase()}`}>{event.method}</span><code>{event.path}</code></td>
      <td><Status code={event.status} /></td><td className="mono muted">{event.latencyMs.toFixed(2)} <span className="subtle">ms</span></td>
      <td className="muted mono">{new Date(event.time).toLocaleTimeString("en-US", { hour12: false })}</td>
      {!compact && <td className="mono subtle" title={event.id}>{event.id.slice(0, 8)}</td>}
    </tr>)}</tbody></table></div>;
}

function TrafficChart({ events }: { events: TrafficEvent[] }) {
  const now = Date.now();
  const bins = Array.from({ length: 24 }, (_, i) => {
    const start = now - (24 - i) * 5000;
    const group = events.filter(e => +new Date(e.time) >= start && +new Date(e.time) < start + 5000);
    return { allowed: group.filter(e => e.status < 400).length, blocked: group.filter(e => e.status >= 400).length };
  });
  const max = Math.max(4, ...bins.map(b => b.allowed + b.blocked));
  return <div className="chart" aria-label="Traffic in five second buckets over the last two minutes">
    <div className="chart-scale">{[max, Math.round(max / 2), 0].map((n, i) => <span key={i}>{n}</span>)}</div>
    <div className="chart-plot"><div className="gridline top" /><div className="gridline middle" /><div className="gridline bottom" />
      <div className="chart-bars">{bins.map((b, i) => <div className="bar-slot" key={i} title={`${b.allowed} allowed, ${b.blocked} blocked`}>
        <div className="bar-blocked" style={{ height: `${b.blocked / max * 100}%` }} />
        <div className="bar-allowed" style={{ height: `${b.allowed / max * 100}%` }} />
      </div>)}</div>
      {!events.length && <div className="chart-placeholder"><Activity size={20} /><span>Your first request starts the story.</span></div>}
      <div className="chart-times"><span>2 min ago</span><span>90 sec</span><span>60 sec</span><span>30 sec</span><span>Now</span></div>
    </div>
  </div>;
}

export default function Console() {
  const [page, setPage] = useState<Page>("Overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/bridge/overview", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Gateway unavailable");
      setOverview(data); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Connection failed"); }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  function navigate(value: Page) { setPage(value); setMobileOpen(false); }

  async function runTraffic() {
    setBusy(true);
    try {
      const results = [
        await sendRequest("writer", "POST", JSON.stringify({ name: "Recruiter demo", description: "A request you can trace from identity to persistence." })),
        await sendRequest("anonymous"),
        await sendRequest("invalid"),
        await sendRequest("reader", "POST", JSON.stringify({ name: "Blocked write", description: "" })),
        ...await Promise.all(Array.from({ length: 20 }, () => sendRequest("writer"))),
      ];
      if (results.some(r => r.status >= 500)) throw new Error("Some requests failed upstream. Check Docker service health.");
      setToast(`24 requests sent · ${results.filter(r => r.status < 400).length} allowed · ${results.filter(r => r.status === 401 || r.status === 403).length} denied · ${results.filter(r => r.status === 429).length} rate limited`);
      await refresh();
    } catch (err) { setToast(err instanceof Error ? err.message : "Traffic generation failed"); }
    finally { setBusy(false); }
  }
  const simulation = overview?.mode !== "live";

  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`}>
      <a className="brand" href="#" onClick={e => { e.preventDefault(); navigate("Overview"); }} aria-label="Identity home"><span className="brand-mark"><Fingerprint size={23} /></span>identity<span className="brand-dot">.</span></a>
      <div className="workspace"><div className="workspace-icon">D</div><div><strong>Demo workspace</strong><span>Personal project</span></div><ChevronDown size={14} /></div>
      <div className="nav-label">WORKSPACE</div>
      <nav>{navigation.slice(0, 3).map(({ name, icon: Icon }) => <button key={name} className={`nav-item ${page === name ? "active" : ""}`} onClick={() => navigate(name)} aria-current={page === name ? "page" : undefined}><Icon size={18} /><span>{name}</span>{name === "API playground" && <span className="nav-tag">API</span>}</button>)}</nav>
      <div className="nav-label second">BUILD & EXPLORE</div>
      <nav>{navigation.slice(3).map(({ name, icon: Icon }) => <button key={name} className={`nav-item ${page === name ? "active" : ""}`} onClick={() => navigate(name)} aria-current={page === name ? "page" : undefined}><Icon size={18} /><span>{name}</span></button>)}</nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note"><div className="note-icon"><ShieldCheck size={18} /></div><strong>Trust is a policy.</strong><p>See what happens between a request and your API.</p><button onClick={() => navigate("Architecture")}>Explore the architecture <ArrowUpRight size={14} /></button></div>
        <div className="profile"><div className="avatar">DE</div><div><strong>Demo engineer</strong><span>Local development</span></div><span className="online-dot" /></div>
      </div>
    </aside>
    {mobileOpen && <button className="sidebar-overlay" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={19} /></button><Layers3 size={16} /><span>Workspace</span><ChevronRight size={13} /><strong>{page}</strong></div><div className="topbar-right"><span className="environment"><span className="online-dot" />Development</span><span className="topbar-divider" /><button className="icon-button" title="View architecture" aria-label="View architecture" onClick={() => navigate("Architecture")}><BookOpen size={18} /></button><div className="avatar small">DE</div></div></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow">IDENTITY-AWARE API GATEWAY <span> / </span> v1.0</div><h1>{page === "Overview" ? "Gateway overview" : page}</h1><p>{{
          Overview: "A clear view of every request. A policy behind every decision.",
          "API playground": "Make a request. Watch identity and policy do their work.",
          "Audit trail": "Follow each decision, from the edge to the database.",
          Architecture: "One entry point. Explicit trust boundaries.",
          "Developer SDK": "Less boilerplate. More building.",
        }[page]}</p></div><div className="heading-actions"><span className={`mode-badge ${simulation ? "" : "live"}`}><Radio size={13} />{overview ? simulation ? "Simulation" : "Live stack" : "Connecting"}</span><button className="button primary" disabled={busy || !!error || !overview} onClick={runTraffic}>{busy ? <LoaderCircle className="spin" size={15} /> : <Zap size={15} />}{busy ? "Sending requests…" : "Generate traffic"}</button></div></div>
        {error && <div className="error-banner" role="alert"><Shield size={18} /><div><strong>Gateway connection unavailable</strong><p>{error}</p></div><button className="button secondary" onClick={() => void refresh()}><RefreshCw size={14} />Retry</button></div>}
        <div className="mode-notice"><span className="notice-icon"><Circle size={10} /></span><span>{simulation ? "Local simulation" : "Connected to Spring Cloud Gateway"}<span className="notice-detail">{simulation ? " · Requests run in memory. Start the Docker stack for real JWT validation and persistence." : " · JWTs issued by Keycloak. Policies enforced by Spring Security and Redis."}</span></span><button onClick={() => navigate(simulation ? "Architecture" : "API playground")}>{simulation ? "How to go live" : "Inspect a request"}<ArrowRight size={13} /></button></div>
        {page === "Overview" && <OverviewPage overview={overview} navigate={navigate} />}
        {page === "API playground" && <Playground onRequest={refresh} notify={setToast} />}
        {page === "Audit trail" && <AuditPage events={overview?.events ?? []} simulation={simulation} />}
        {page === "Architecture" && <Architecture />}
        {page === "Developer SDK" && <Developer notify={setToast} />}
        <footer><span><Fingerprint size={14} /> Identity Gateway <span className="footer-slash">/</span> Built to make trust visible.</span><span>Java · Spring Boot · Next.js <span className="footer-slash">/</span> Demo project</span></footer>
      </main>
    </div>
    {toast && <div className="toast" role="status"><CheckCheck size={18} /><span>{toast}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast("")}><X size={16} /></button></div>}
  </div>;
}

function OverviewPage({ overview, navigate }: { overview: Overview | null; navigate: (page: Page) => void }) {
  const metrics = [
    { title: "Total requests", value: overview?.total, unit: "", icon: ArrowUpRight, note: "Projects API · since process start", color: "green" },
    { title: "Allowed requests", value: overview?.allowed, unit: "", icon: ShieldCheck, note: "Authenticated & authorized", color: "green" },
    { title: "Access denied", value: overview?.denied, unit: "", icon: LockKeyhole, note: "Invalid identity or missing scope", color: "orange" },
    { title: "Rate limited", value: overview?.limited, unit: "", icon: Gauge, note: "Requests exceeding the token bucket", color: "purple" },
  ];
  return <>
    <div className="metrics">{metrics.map(m => <section className="metric" key={m.title}><div className="metric-label">{m.title}<m.icon size={16} /></div><div className="metric-value">{m.value?.toLocaleString() ?? "—"}<span>{m.unit}</span></div><div className="metric-note"><span className={`tiny-dot ${m.color}`} />{m.note}</div></section>)}</div>
    <div className="overview-grid">
      <section className="panel traffic-panel"><PanelTitle title="Request activity" subtitle="Observed requests · last 2 minutes · up to 100 events"><div className="chart-legend"><span><i className="green" />Allowed</span><span><i className="orange" />Blocked</span></div></PanelTitle><TrafficChart events={overview?.events ?? []} /><div className="chart-footer"><span><Clock3 size={13} />Recent p95 <strong>{overview?.p95 ?? 0} ms</strong></span><span className="subtle">Measured at the {overview?.mode === "live" ? "gateway" : "simulator"} · not a benchmark</span></div></section>
      <section className="panel policy-panel"><PanelTitle title="Your protection layer"><span className="small-badge">3 POLICIES</span></PanelTitle><div className="policy-row"><div className="policy-icon"><Fingerprint size={19} /></div><div><strong>Verified identity</strong><p>Issuer, signature, expiry & audience</p></div><Check size={15} /></div><div className="policy-row"><div className="policy-icon"><LockKeyhole size={18} /></div><div><strong>Scope-based access</strong><p>Read and write are separate grants</p></div><Check size={15} /></div><div className="policy-row"><div className="policy-icon"><Gauge size={19} /></div><div><strong>Per-identity rate limits</strong><p>5 requests / sec · burst of 10</p></div><Check size={15} /></div><button className="panel-link" onClick={() => navigate("API playground")}>Put your policies to the test <ArrowRight size={15} /></button></section>
    </div>
    <section className="panel route-panel"><PanelTitle title="Gateway routes" subtitle="Two routes. One consistent security boundary."><span className="count-badge">2 configured</span></PanelTitle><div className="table-scroll"><table><thead><tr><th>Route / service</th><th>Endpoint</th><th>Required scope</th><th>Policy</th><th /></tr></thead><tbody>
      <tr><td><div className="service-cell"><div className="service-icon"><Layers3 size={17} /></div><div><strong>Projects API</strong><span>Spring Boot · PostgreSQL</span></div></div></td><td><code>/api/projects/**</code></td><td><span className="scope-tag">projects:read / write</span></td><td><span className="policy-tag"><ShieldCheck size={13} />JWT + rate limit</span></td><td><button className="icon-button" aria-label="Try projects API" onClick={() => navigate("API playground")}><ArrowUpRight size={17} /></button></td></tr>
      <tr><td><div className="service-cell"><div className="service-icon purple"><Activity size={17} /></div><div><strong>Platform API</strong><span>Audit events · MongoDB</span></div></div></td><td><code>/api/platform/**</code></td><td><span className="scope-tag">platform:read</span></td><td><span className="policy-tag"><ShieldCheck size={13} />JWT + rate limit</span></td><td><button className="icon-button" aria-label="View audit events" onClick={() => navigate("Audit trail")}><ArrowUpRight size={17} /></button></td></tr>
    </tbody></table></div></section>
    <section className="panel"><PanelTitle title="Recent requests"><button className="text-button" onClick={() => navigate("Audit trail")}>View all activity <ArrowRight size={14} /></button></PanelTitle>{overview?.events.length ? <EventTable events={overview.events.slice(0, 5)} /> : <Empty title="The gateway is ready." text="Generate traffic or open the playground to see requests here." />}</section>
    <button className="sdk-banner" onClick={() => navigate("Developer SDK")}><span className="sdk-banner-icon"><Code2 size={22} /></span><span><strong>Your next integration starts here.</strong><span>A typed SDK, useful errors, and a few lines of TypeScript.</span></span><span className="sdk-banner-link">Explore the SDK <ArrowUpRight size={16} /></span></button>
  </>;
}

function Playground({ onRequest, notify }: { onRequest: () => Promise<void>; notify: (message: string) => void }) {
  const [identity, setIdentity] = useState<Identity>("writer");
  const [method, setMethod] = useState("GET");
  const [body, setBody] = useState('{\n  "name": "My first project",\n  "description": "Protected by Identity Gateway"\n}');
  const [result, setResult] = useState<RequestResult | null>(null);
  const [sending, setSending] = useState(false);
  const [claims, setClaims] = useState<object | null>(null);
  const [responseTab, setResponseTab] = useState<"body" | "headers">("body");
  useEffect(() => {
    const controller = new AbortController();
    setClaims(null);
    if (identity === "writer" || identity === "reader")
      fetch(`/api/session?identity=${identity}`, { signal: controller.signal }).then(r => r.json()).then(setClaims).catch(() => {});
    return () => controller.abort();
  }, [identity]);
  async function send() {
    setSending(true);
    try { setResult(await sendRequest(identity, method, method === "POST" ? body : undefined)); await onRequest(); }
    catch { notify("Request failed. Check the console connection and retry."); }
    finally { setSending(false); }
  }
  return <>
    <div className="playground-grid"><section className="panel"><PanelTitle title="Request builder" subtitle="Choose an identity and exercise the policy." /><div className="request-form">
      <label htmlFor="identity">Client identity</label><select id="identity" value={identity} onChange={e => setIdentity(e.target.value as Identity)}><option value="writer">Developer · read + write</option><option value="reader">Integration · read only</option><option value="anonymous">Anonymous · no token</option><option value="invalid">Invalid · malformed token</option></select>
      <div className="identity-scopes">{identity === "writer" || identity === "reader" ? <><span className="scope-tag">projects:read</span>{identity === "writer" && <span className="scope-tag">projects:write</span>}</> : <span className="muted">Expected result: 401 Unauthorized</span>}</div>
      <label htmlFor="method">Endpoint</label><div className="request-url"><select id="method" value={method} onChange={e => setMethod(e.target.value)}><option>GET</option><option>POST</option></select><code>/api/projects</code></div>
      {method === "POST" && <><label htmlFor="request-body">JSON body</label><textarea id="request-body" value={body} onChange={e => setBody(e.target.value)} spellCheck={false} rows={6} /></>}
      <button className="button primary send-button" disabled={sending} onClick={send}>{sending ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />}{sending ? "Sending…" : "Send request"}<span>↵</span></button>
      <p className="form-hint">Try a POST with the read-only identity to get a 403. Send a burst with “Generate traffic” to exercise 429 responses.</p>
    </div></section>
      <section className="panel response-panel"><PanelTitle title="Response">{result && <div className="response-meta"><Status code={result.status} /><span className="mono muted">{result.latency} ms</span></div>}</PanelTitle>
        <div className="tabs"><button className={responseTab === "body" ? "selected" : ""} onClick={() => setResponseTab("body")}>Body</button><button className={responseTab === "headers" ? "selected" : ""} onClick={() => setResponseTab("headers")}>Headers</button>{result && <button className="copy-response" onClick={() => { void navigator.clipboard.writeText(JSON.stringify(responseTab === "body" ? result.body : result.headers, null, 2)).then(() => notify("Response copied")).catch(() => notify("Clipboard unavailable")); }} aria-label="Copy response"><Copy size={14} /></button>}</div>
        {result ? <pre className="response-code">{JSON.stringify(responseTab === "body" ? result.body : result.headers, null, 2)}</pre> : <Empty icon={Terminal} title="Ready when you are." text="Send a request to inspect the response and headers." />}
        {result && <div className="response-foot"><Clock3 size={13} />Round-trip time includes the console proxy.</div>}
      </section>
    </div>
    <section className="panel"><PanelTitle title="Identity inspector" subtitle="Selected claims only. Access tokens and client secrets stay on the console server."><span className="small-badge">OIDC / JWT</span></PanelTitle>{claims ? <pre className="claims-code">{JSON.stringify(claims, null, 2)}</pre> : <Empty icon={Fingerprint} title={identity === "anonymous" ? "No identity attached" : identity === "invalid" ? "This token cannot be decoded" : "Loading identity…"} text={identity === "anonymous" || identity === "invalid" ? "The gateway will reject this request before routing." : "Contacting the identity provider."} />}</section>
  </>;
}

function AuditPage({ events, simulation }: { events: TrafficEvent[]; simulation: boolean }) {
  const [tab, setTab] = useState("traffic");
  const [audit, setAudit] = useState<Audit[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const loadAudit = useCallback(async () => {
    try {
      const response = await fetch("/api/bridge/audit");
      if (!response.ok) throw new Error("Audit store is unavailable. Check the platform service and MongoDB.");
      setAudit(await response.json()); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Audit unavailable"); }
  }, []);
  useEffect(() => { void loadAudit(); }, [loadAudit]);
  const filtered = events.filter(e => `${e.id} ${e.path} ${e.status} ${e.method}`.toLowerCase().includes(filter.toLowerCase()));
  return <section className="panel"><PanelTitle title="Activity explorer" subtitle="Gateway decisions and application mutations have separate lifecycles."><button className="button secondary" onClick={() => void loadAudit()}><RefreshCw size={14} />Refresh audits</button></PanelTitle>
    <div className="audit-toolbar"><div className="tabs"><button className={tab === "traffic" ? "selected" : ""} onClick={() => setTab("traffic")}>Gateway requests <span>{events.length}</span></button><button className={tab === "audit" ? "selected" : ""} onClick={() => setTab("audit")}>Project mutations <span>{audit.length}</span></button></div>{tab === "traffic" && <div className="search-field"><Search size={14} /><input aria-label="Filter requests" placeholder="Filter by status, path, or ID…" value={filter} onChange={e => setFilter(e.target.value)} /></div>}</div>
    {tab === "traffic" ? filtered.length ? <EventTable events={filtered} /> : <Empty title="No matching requests" text="Generate traffic or change your filter." /> : error ? <div className="inline-error" role="alert">{error}</div> : audit.length ? <div className="table-scroll"><table><thead><tr><th>Action</th><th>Actor</th><th>Resource</th><th>Correlation ID</th><th>Time</th></tr></thead><tbody>{audit.map(a => <tr key={a.id}><td><span className="policy-tag"><Check size={14} />{a.action}</span></td><td className="mono muted" title={a.actor}>{a.actor.length > 20 ? `${a.actor.slice(0, 16)}…` : a.actor}</td><td className="mono subtle" title={a.resource}>{a.resource.slice(0, 8)}</td><td className="mono subtle" title={a.requestId}>{a.requestId.slice(0, 8)}</td><td className="mono muted">{new Date(a.time).toLocaleTimeString()}</td></tr>)}</tbody></table></div> : <Empty icon={Database} title="No project mutations yet" text="Create a project in the playground to produce an audit event." />}
    <div className="panel-footnote"><Database size={14} />{simulation ? "Simulation data lives in memory and resets when the console process restarts." : "Gateway traffic: last 100 events in process memory. Project mutations: last 50 events persisted in MongoDB."}</div>
  </section>;
}

function Architecture() {
  return <>
    <section className="panel architecture-panel"><PanelTitle title="Designed around identity" subtitle="The live Docker stack · each boundary has a specific responsibility."><span className="small-badge">SYSTEM MAP</span></PanelTitle>
      <div className="architecture-map">
        <div className="arch-identity"><div className="arch-node compact"><Fingerprint size={22} /><div><strong>Keycloak</strong><span>OIDC issuer · signed access tokens</span></div><span className="tech-label">RS256</span></div><div className="arch-connector vertical"><span>JWKS · public keys</span><ArrowDown size={17} /></div></div>
        <div className="arch-flow"><div className="arch-node"><Code2 size={25} /><strong>Console / SDK</strong><span>Client credentials via BFF</span><span className="tech-label">NEXT.JS · TYPESCRIPT</span></div><div className="arch-connector"><span>Bearer JWT</span><ArrowRight size={22} /></div><div className="arch-node gateway-node"><ShieldCheck size={28} /><strong>Identity Gateway</strong><span>Validate → authorize → limit</span><span className="tech-label">SPRING CLOUD GATEWAY</span></div><div className="arch-connector"><span>Token relay</span><ArrowRight size={22} /></div><div className="arch-node"><Server size={25} /><strong>Platform service</strong><span>Revalidate JWT · isolate owners</span><span className="tech-label">SPRING BOOT</span></div></div>
        <div className="storage-flow"><div className="storage-node"><Zap size={19} /><div><strong>Redis</strong><span>Atomic token buckets</span></div></div><div className="storage-node"><Database size={19} /><div><strong>PostgreSQL</strong><span>Projects · Flyway migrations</span></div></div><div className="storage-node"><Layers3 size={19} /><div><strong>MongoDB</strong><span>Audit documents after commit</span></div></div></div>
      </div>
    </section>
    <div className="architecture-cards">
      <section className="panel explanation"><span className="step-number">01 / VERIFY</span><h3>Trust the signature.</h3><p>Spring Security verifies the JWT signature against Keycloak’s public keys, then checks the issuer, expiry, and API audience. A missing or invalid token returns 401.</p></section>
      <section className="panel explanation"><span className="step-number">02 / AUTHORIZE</span><h3>Grant the minimum.</h3><p>Read, write, and platform access are distinct scopes. The API uses the verified subject to isolate project ownership. Another identity sees a 404 for a private project.</p></section>
      <section className="panel explanation"><span className="step-number">03 / PROTECT</span><h3>Keep traffic fair.</h3><p>Redis maintains an atomic token bucket per verified issuer and subject, per route. Each bucket holds 10 tokens and refills at 5 per second. Exhausted requests receive 429.</p></section>
    </div>
    <div className="two-column"><section className="panel"><PanelTitle title="Bring the real stack online" subtitle="From the repository root · Docker Desktop running" /><div className="code-block"><span className="code-comment"># Start all services, including the live console</span><code>docker compose --profile console up -d --build</code><span className="code-comment"># Verify authentication, scopes, persistence & rate limits</span><code>npm run demo:live</code><span className="code-comment"># Open the console</span><code>http://localhost:3000</code></div><div className="panel-footnote"><Circle size={13} />Stop a locally running console first to free port 3000.</div></section>
      <section className="panel"><PanelTitle title="Intentional demo tradeoffs" /><div className="tradeoffs"><p><strong>Local-only credentials.</strong> Service accounts make the demo repeatable. A production console needs user login with Authorization Code + PKCE and server-side sessions.</p><p><strong>Observable, not highly available.</strong> One instance of each service. No uptime or throughput claim without a recorded measurement.</p><p><strong>Two stores, no distributed transaction.</strong> MongoDB audit writes follow the PostgreSQL commit. Delivery failures are counted; a production outbox would close that gap.</p><p><strong>Redis failure is fail-open.</strong> Spring’s default limiter preserves availability if Redis is unreachable. Choose and test a fail-closed policy for strict quotas.</p></div></section></div>
  </>;
}

function Developer({ notify }: { notify: (message: string) => void }) {
  const [tab, setTab] = useState("typescript");
  const code = tab === "typescript" ? sdkExample : curlExample;
  return <>
    <div className="developer-hero"><div className="developer-icon"><Code2 size={34} /></div><div><span className="eyebrow">THE DEVELOPER EXPERIENCE</span><h2>From identity to API,<br />in a few lines.</h2><p>A small, typed client with token providers, cancellation, timeouts, and errors you can act on.</p></div><span className="version-pill">@identity/sdk <span>v1.0.0</span></span></div>
    <div className="sdk-grid"><section className="panel sdk-code-panel"><PanelTitle title="Make your first request"><button className="button secondary" onClick={() => { void navigator.clipboard.writeText(code).then(() => notify("Example copied")).catch(() => notify("Clipboard unavailable")); }}><Copy size={14} />Copy example</button></PanelTitle><div className="tabs"><button className={tab === "typescript" ? "selected" : ""} onClick={() => setTab("typescript")}>TypeScript SDK</button><button className={tab === "curl" ? "selected" : ""} onClick={() => setTab("curl")}>cURL</button></div><pre className="sdk-code">{code.split("\n").map((line, index) => <div key={index}><span className="line-number">{index + 1}</span><span className={line.trim().startsWith("//") || line.trim().startsWith("#") ? "code-comment" : ""}>{line || " "}</span></div>)}</pre></section>
      <div className="sdk-side"><section className="panel explanation"><div className="small-icon"><Terminal size={19} /></div><h3>Run the SDK locally</h3><p>This is a workspace package, not a published npm package. Build it, then run the included example against the Docker stack.</p><pre className="mini-code">npm run build -w @identity/sdk{"\n"}node scripts/sdk-demo.mjs</pre></section><section className="panel explanation"><div className="small-icon"><GitBranch size={19} /></div><h3>A predictable contract</h3><ul className="feature-list"><li><Check size={14} />Typed project models</li><li><Check size={14} />Async access-token provider</li><li><Check size={14} />Request IDs on errors</li><li><Check size={14} />AbortSignal + request timeout</li><li><Check size={14} />No unsafe automatic write retries</li></ul></section></div></div>
    <section className="panel"><PanelTitle title="Know your responses" /><div className="response-guide">{[{ code: 200, title: "Allowed", text: "Valid identity, scope, and capacity." }, { code: 401, title: "Unauthorized", text: "Missing, expired, or invalid JWT." }, { code: 403, title: "Forbidden", text: "Valid identity, insufficient scope." }, { code: 429, title: "Rate limited", text: "Wait for the token bucket to refill." }].map(r => <div key={r.code}><Status code={r.code} /><h3>{r.title}</h3><p>{r.text}</p></div>)}</div></section>
  </>;
}
