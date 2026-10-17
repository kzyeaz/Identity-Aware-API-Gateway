import { IdentityClient, GatewayError } from "@identity/sdk";
const response = await fetch(`${process.env.KEYCLOAK_URL ?? "http://localhost:8180"}/realms/identity/protocol/openid-connect/token`, {
  method: "POST", body: new URLSearchParams({
    grant_type: "client_credentials", client_id: "demo-writer",
    client_secret: process.env.WRITER_SECRET ?? "writer-local-only",
  }), signal: AbortSignal.timeout(10_000),
});
if (!response.ok) throw new Error(`Token endpoint returned ${response.status}. Is the Docker stack running?`);
const { access_token } = await response.json();
const client = new IdentityClient({ baseUrl: process.env.GATEWAY_URL ?? "http://localhost:8088", token: () => access_token });
try {
  const created = await client.createProject({ name: "SDK integration", description: "Created with the TypeScript SDK." });
  console.log("Created project:", created.id);
  const projects = await client.listProjects();
  console.log("Projects visible to this identity:", projects.length);
} catch (error) {
  if (error instanceof GatewayError) console.error({ status: error.status, requestId: error.requestId, body: error.body });
  throw error;
}
