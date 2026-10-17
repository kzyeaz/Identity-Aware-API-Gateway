# Architecture and decisions

## Scope

This project demonstrates a service-to-service OAuth 2.0 client-credentials flow against an OIDC provider, an identity-aware gateway, a protected resource server, and an operations console. It is a local portfolio application, not a production deployment.

The API resource is a **project**. Every project belongs to the `sub` of the verified JWT. This is subject isolation, not a full organization/tenant membership system. The realm uses a single configured issuer, so subject collisions across issuers cannot occur in the platform store.

## Components

| Component | Responsibility | Why this boundary |
|---|---|---|
| Next.js BFF | Serve the React console; acquire and cache demo service-account tokens; proxy a fixed allowlist of demo routes | Tokens and client secrets stay off the browser. Arbitrary upstream URLs are not accepted. |
| Keycloak | Token issuance, client authentication, signing keys, OIDC discovery | The gateway should verify tokens, not implement an identity provider. |
| Spring Cloud Gateway | Reactive proxy, JWT verification, scope checks, correlation IDs, distributed token buckets | Central entry policy; rate limiting works across gateway replicas sharing Redis. |
| Platform API | Revalidate tokens, enforce operation scopes, scope queries by subject, validate DTOs | The platform does not trust network position or identity headers. |
| PostgreSQL | Transactional project state and Flyway migrations | Relational invariants and indexed ownership queries. |
| MongoDB | Append-oriented audit documents | Demonstrates a separate operational history store with a flexible event shape. A single PostgreSQL store would be simpler for this small workload. |
| Redis | Shared, atomic token buckets | Lua-based limiter avoids read/modify/write races between gateways. |
| TypeScript SDK | Typed operations, token callback, timeouts, cancellation, structured failures | Callers use a domain client rather than duplicating raw HTTP setup. |

## Request lifecycle

1. The BFF obtains a five-minute Keycloak access token using a demo service account. Concurrent acquisitions for the same identity share one request. Tokens refresh 30 seconds before expiry.
2. Every gateway response receives a generated UUID request ID and `Cache-Control: no-store`. The caller cannot select a correlation ID or spoof `X-User-Id` / `X-Tenant-Id`.
3. Spring Security verifies the signature using cached JWKS keys. It checks issuer, audience `identity-api`, and token times (including the framework’s default clock skew).
4. The gateway checks the operation’s scope. Missing/invalid credentials produce 401; insufficient scope produces 403. Unknown paths and unsupported methods are denied.
5. An authenticated, authorized request reaches the route limiter. The bucket key is the verified **issuer + subject**, namespaced by Spring Cloud Gateway’s route ID. Each route permits five tokens per second and holds ten tokens.
6. Allowed traffic forwards to the platform with the original bearer token. The platform independently verifies the JWT and checks the same resource scopes.
7. Reads query `owner = jwt.sub`; individual reads query both ID and owner. This deliberately returns 404 for another subject’s resource.
8. A project write commits to PostgreSQL. A Spring transaction event listener then records a MongoDB audit event containing actor, action, resource, timestamp, and request ID.
9. The gateway records completion status and elapsed time in a bounded, process-local ledger. JWT denials are captured because the tracking filter executes before Spring Security.

## Identities and policies

| Client | Scopes | Intended demonstration |
|---|---|---|
| `demo-writer` | `projects:read projects:write` | Successful GET and POST |
| `demo-reader` | `projects:read` | GET allowed, POST denied |
| `console-admin` | `platform:read` | Read telemetry, audit data, and Prometheus metrics |
| No token / malformed token | None | 401 before routing |

Each service account has its own subject. Reader and writer do not share projects. The console’s operational polling uses the admin identity and does not inflate the projects traffic dashboard.

The local BFF automatically supplies the above identities for presentation. Its same-origin mutation check and route allowlist are defensive measures, not a substitute for user authentication. It must not be exposed as an internet admin console.

## Persistence and consistency

PostgreSQL is authoritative for project writes. MongoDB is not part of its transaction. Audit events are emitted **after commit**, so a failed PostgreSQL write cannot produce a successful mutation audit.

If MongoDB is unavailable after commit, the API still reports the project creation accurately. The listener logs the correlation ID and increments `identity.audit.write.failures`. **Audit delivery is best effort:** there is no durable retry queue, transactional outbox, or distributed transaction. This also means audit insertion can add latency to a successful write.

A production evolution would write an outbox row in the same PostgreSQL transaction and publish it asynchronously to MongoDB. Event IDs would support idempotent consumers, with retries and a dead-letter strategy.

The demo stores database credentials in Compose and uses internal network isolation rather than database authentication for MongoDB/Redis. Keycloak uses its persisted development database. Production requires proper database users, secret management, TLS, and a supported Keycloak production database.

## Rate limiting and failures

- Quotas are per identity **and per route**, not global across all APIs.
- Bucket state is in Redis, not local JVM memory.
- Tokens are spent for authorized requests even if downstream validation returns 400.
- 401/403 requests do not reach the route limiter. The demo does not implement pre-authentication IP throttling or DDoS protection.
- The built-in Spring Redis limiter **fails open** if Redis is unavailable. That behavior trades strict quota enforcement for availability. A strict contract would need a tested fail-closed limiter.
- The gateway uses a two-second connection timeout and a five-second upstream response timeout. The SDK and BFF use separate request timeouts.
- No automatic POST retries. A timeout after commit is ambiguous; production idempotency keys would support safe write retries.

## Observability and its limits

The gateway’s protected `/gateway/overview` endpoint reports total project requests, successful responses, access denials, rate-limited requests, and the last 100 events.

- Counters reset on gateway restart and belong to one instance.
- p95 uses nearest rank over the last 100 captured request durations, including rejected requests. It is not a durable service-level percentile.
- The two-minute chart uses only that bounded event sample. It can undercount at high traffic.
- Timing runs until response commit (time to headers), not full response-body transfer.
- The console polls every three seconds. Those operational reads are excluded from project counts.
- Prometheus at `/actuator/prometheus` requires `platform:read`. A production scraper should have a dedicated identity and retain the time series externally.
- Project mutation audits survive platform and gateway restarts in MongoDB.

## Deployment and scaling

Compose publishes only the console, gateway, and identity provider on loopback. Containers for databases and the platform API are reachable only on the Compose network. Java runtime containers run as a non-root user.

To scale: place multiple gateways behind a load balancer, share Redis, run stateless platform replicas against PostgreSQL/MongoDB, deploy Keycloak in production mode, and externalize metrics. PostgreSQL connection pools and downstream capacity, not merely reactive routing, determine the system’s practical throughput.

For a production browser flow, replace the local demo switcher with Authorization Code + PKCE, secure server sessions, CSRF protection for cookie-authenticated mutations, and explicit operator permissions. Client credentials remain appropriate for trusted server-to-server integrations.

## Claims and targets

50,000 requests/day is roughly 0.58 requests/second **on average**, with unknown burstiness. It is not a load-test result. 99.9% availability requires a defined SLI, a measurement period, and retained observations; a local container healthcheck cannot establish it.

The repository includes Testcontainers, JaCoCo, a CI definition, a functional live smoke test, and a small k6 workload. Record their actual outputs before quoting any metric. A 90% test-coverage statement needs a coverage type and scope, such as “JaCoCo line coverage across the two Java services.”
