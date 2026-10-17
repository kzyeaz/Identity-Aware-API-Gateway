export interface Project {
  id: string;
  owner: string;
  name: string;
  description: string;
  createdAt: string;
}

export class GatewayError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    public readonly requestId: string | null,
    public readonly retryAfter: string | null,
  ) {
    super(`Gateway request failed (${status})`);
    this.name = "GatewayError";
  }
}

export interface GatewayOptions {
  baseUrl: string;
  /** Supply an access token from your OIDC client. Never put a client secret in browser code. */
  token: () => string | Promise<string>;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

export class IdentityClient {
  private readonly baseUrl: string;
  private readonly transport: typeof globalThis.fetch;
  constructor(private readonly options: GatewayOptions) {
    const url = new URL(options.baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Expected an HTTP(S) base URL");
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.transport = options.fetch ?? globalThis.fetch;
  }

  private async request<T>(path: string, method: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 10_000);
    const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const response = await this.transport(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await this.options.token()}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: combinedSignal,
    });
    const text = await response.text();
    let data: unknown = text;
    if (text) { try { data = JSON.parse(text); } catch { /* Preserve non-JSON upstream errors. */ } }
    else data = null;
    if (!response.ok) throw new GatewayError(response.status, data,
      response.headers.get("x-request-id"), response.headers.get("retry-after"));
    return data as T;
  }

  listProjects(signal?: AbortSignal): Promise<Project[]> { return this.request("/api/projects", "GET", undefined, signal); }
  getProject(id: string, signal?: AbortSignal): Promise<Project> {
    return this.request(`/api/projects/${encodeURIComponent(id)}`, "GET", undefined, signal);
  }
  createProject(input: Pick<Project, "name" | "description">, signal?: AbortSignal): Promise<Project> {
    // Deliberately no automatic retries: a timeout does not prove a POST failed to commit.
    return this.request("/api/projects", "POST", input, signal);
  }
}
