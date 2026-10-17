# @identity/sdk

A local workspace TypeScript SDK for the projects API. It is not published to npm.

```sh
npm ci
npm run build -w @identity/sdk
node scripts/sdk-demo.mjs
```

```ts
import { IdentityClient, GatewayError } from "@identity/sdk";

const client = new IdentityClient({
  baseUrl: "http://localhost:8088",
  token: async () => oidcClient.getAccessToken(),
  timeoutMs: 10_000,
});

const project = await client.createProject({ name: "Demo", description: "An integration" });
const visibleProjects = await client.listProjects();
const sameProject = await client.getProject(project.id);
```

All operations accept an optional `AbortSignal` as their last argument. The token callback runs for every operation so your OIDC library can handle refresh. Client credentials belong in a trusted server process, never a browser bundle.

`GatewayError` includes `status`, parsed `body` (or original text), `requestId`, and `retryAfter` when the server supplies it. Transport failures and aborts propagate as their original errors. Return values have TypeScript types but are not runtime schema-validated.

There are no automatic retries. In particular, a write timeout may occur after the backend commits. Applications should not retry POSTs without a server-supported idempotency mechanism.

Spring’s default Redis limiter returns rate-limit headers and a 429 status, but does not guarantee a `Retry-After` header. Handle its absence and apply bounded backoff in the consuming application.
