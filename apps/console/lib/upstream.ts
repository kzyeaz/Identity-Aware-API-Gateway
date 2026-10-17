export const isSimulation = () => process.env.DEMO_MODE !== "false";
type Client = "writer" | "reader" | "admin";
const cache = new Map<Client, { token: string; expires: number }>();
const pending = new Map<Client, Promise<string>>();

export async function getToken(identity: Client): Promise<string> {
  const current = cache.get(identity);
  if (current && current.expires > Date.now() + 30_000) return current.token;
  const active = pending.get(identity);
  if (active) return active;
  const request = (async () => {
    const credentials = {
      writer: ["demo-writer", process.env.WRITER_SECRET ?? "writer-local-only"],
      reader: ["demo-reader", process.env.READER_SECRET ?? "reader-local-only"],
      admin: ["console-admin", process.env.CONSOLE_SECRET ?? "console-local-only"]
    };
    const [clientId, secret] = credentials[identity];
    const response = await fetch(`${process.env.KEYCLOAK_URL ?? "http://localhost:8180"}/realms/identity/protocol/openid-connect/token`, {
      method: "POST",
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: secret }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Identity provider unavailable");
    const data = await response.json() as { access_token: string; expires_in: number };
    cache.set(identity, { token: data.access_token, expires: Date.now() + data.expires_in * 1000 });
    return data.access_token;
  })();
  pending.set(identity, request);
  try { return await request; } finally { pending.delete(identity); }
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Browser mutations must originate from the console itself. Command-line clients have no Origin.
  return !origin || origin === `${new URL(request.url).protocol}//${request.headers.get("host") ?? new URL(request.url).host}`;
}
