export type Identity = "writer" | "reader" | "anonymous" | "invalid";
export type Page = "Overview" | "API playground" | "Audit trail" | "Architecture" | "Developer SDK";
export interface TrafficEvent {
  id: string; time: string; method: string; path: string; status: number; latencyMs: number;
}
export interface Overview {
  total: number; allowed: number; denied: number; limited: number; p95: number;
  events: TrafficEvent[]; startedAt: string; mode: "simulation" | "live";
}
export interface Audit {
  id: string; actor: string; action: string; resource: string; requestId: string; time: string;
}
export interface RequestResult {
  status: number; latency: number; body: unknown; headers: Record<string, string>;
}
