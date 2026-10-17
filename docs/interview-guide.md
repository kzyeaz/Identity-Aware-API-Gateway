# Recruiter and interviewer walkthrough

## Your opening

“I built an identity-aware gateway with a developer console and TypeScript SDK. Keycloak issues signed OAuth access tokens. Spring Security verifies them, the gateway enforces scopes and distributed rate limits, and a separate resource server enforces ownership before touching data. The console lets me demonstrate both allowed and rejected requests.”

Show **Live stack** before saying the demo uses real JWT validation or databases. If you choose simulation, say so immediately and explain that it is the presentation fallback.

## The demonstration

### 0:00–0:45 — explain the system

Open Architecture. Follow browser → BFF → gateway → platform. Point out Redis, PostgreSQL, MongoDB, and Keycloak. Explain that the platform verifies the token again.

Avoid starting with a long list of technologies. Start with the problem: “Every API request needs the right identity, permission, and traffic budget.”

### 0:45–2:00 — make the policy visible

Open API playground:

1. Developer, GET `/api/projects`: expect 200.
2. Read-only integration, POST: expect 403. The caller is authenticated but lacks `projects:write`.
3. Anonymous, GET: expect 401. No identity was established.
4. Invalid token, GET: expect 401. Decoding arbitrary JSON is not authentication.
5. Developer, POST: expect 201. Give the project a memorable name.

Open Identity inspector. Point to `iss`, `sub`, `aud`, and `scope`. The browser sees selected claims, not the bearer token or client secret.

### 2:00–3:00 — trace and protect

Copy or note the `x-request-id` response header. Open Project mutations and find that ID. The project is in PostgreSQL; the correlated event is in MongoDB.

Click Generate traffic. It creates a project, sends authentication and authorization failures, and bursts twenty reads. Inspect 429s. “The bucket is keyed by a verified identity, so spoofing an identity header does not create a fresh budget.”

Wait about two seconds between bursts if you want the initial project write to succeed.

### 3:00–4:00 — show developer experience

Open Developer SDK, then run:

```sh
npm run build -w @identity/sdk
node scripts/sdk-demo.mjs
```

Explain the token-provider callback, typed models, request ID in `GatewayError`, and why automatic POST retries are intentionally absent.

### 4:00–5:00 — show evidence and tradeoffs

Show the JaCoCo reports, the live smoke report, and one Testcontainers test. Explain why you test with real PostgreSQL, MongoDB, and Redis rather than mocking persistence semantics.

Pick one tradeoff to discuss without prompting:

- The MongoDB audit is after-commit and best effort; an outbox would make delivery durable.
- Redis limiter failure is fail-open; strict quota enforcement needs a different failure policy.
- Client credentials suit machine clients. The local operator console needs an actual user-login flow before production.

## Likely technical questions

**Why both the gateway and the service validate JWTs?**  
The gateway provides consistent entry policy. The service protects its own trust boundary, even if another internal caller reaches it. Signature verification is local once keys are cached.

**OAuth versus OIDC?**  
OAuth 2.0 delegates API authorization. OIDC adds an identity layer and discovery conventions. This demo uses an OIDC provider and JWT access-token validation with the OAuth client-credentials grant. It does not implement an interactive user login.

**What prevents one user from reading another user’s project?**  
The resource query includes the verified JWT subject. Request headers and JSON cannot override ownership. A project belonging to another subject returns 404.

**How does rate limiting work across multiple gateways?**  
The gateways share Redis. Spring’s limiter uses Lua for atomic token-bucket updates. The key includes the verified issuer and subject, and Spring namespaces it by route. Local metrics would still need aggregation.

**Why reactive gateway and a servlet/JPA service?**  
Gateway work is primarily network I/O and benefits from a non-blocking pipeline. JPA is blocking, so it lives in a separate servlet service rather than on the gateway event loop.

**Why MongoDB as well as PostgreSQL?**  
It demonstrates flexible audit documents separated from transactional records, but it introduces consistency and operational costs. For this workload alone, PostgreSQL could hold both. Explain that tradeoff honestly.

**What happens when the write commits but audit logging fails?**  
The client still receives the correct write result. The failure is logged and counted, but there is no guaranteed delivery. The next improvement would be a transactional outbox with retries.

**What happens when Redis is down?**  
The default limiter fails open. Availability is preserved at the expense of quotas. This is documented rather than hidden behind a “secure” label.

**Why no retry in the SDK?**  
A network failure does not prove the server failed to commit a POST. Safe retries need an idempotency key and a server-side deduplication contract.

**What does 90% coverage mean?**  
Quote the actual JaCoCo line or branch result and explain what is covered. Coverage alone does not establish correctness. Negative JWT, owner-isolation, and infrastructure-backed tests are the stronger evidence.

**How did you use AI?**  
“AI assisted implementation and review. I verify generated changes through tests, live requests, and manual inspection of the security model.” Do not say you personally reviewed code until you have read and understood it.

## Résumé wording you can defend

Before performance or availability measurement:

> Built a Spring Cloud Gateway demo with OAuth 2.0/OIDC JWT validation, scope-based authorization, Redis rate limiting, and owner-scoped APIs backed by PostgreSQL and MongoDB; delivered a Next.js operations console and typed TypeScript SDK.

After reading and confirming your recorded test reports:

> Verified authentication, authorization, ownership isolation, and persistence using JUnit Jupiter, Mockito, Testcontainers, and browser tests; added JaCoCo coverage reporting and a Jenkins pipeline for automated testing, security scanning, and image builds.

The current build uses Spring Boot 4 / Spring Framework 7 and JUnit 6 (Jupiter). Your original draft says JUnit 5; update that wording when describing this version. The migration keeps the familiar Jupiter test API while using the framework's supported dependency versions.

If the actual line-coverage report exceeds 90%, replace “JaCoCo coverage reporting” with the measured percentage and scope. Say “configured a Jenkins pipeline” until you have an actual Jenkins execution. Use “designed for” or “load-tested at” only with the corresponding assumptions or measured report.

Do not retain “50K+ daily requests” or “99.9% uptime” as achieved results unless you have real traffic/availability evidence. A short load test cannot establish long-term uptime.

## Pre-interview checklist

- Start Docker and run `npm run demo:live`.
- Open the console and confirm Live stack.
- Open the architecture document and coverage report in separate tabs.
- Run the SDK example once.
- Know the three public local ports: 3000, 8088, 8180.
- Review `SecurityConfig`, `GatewayRoutes`, `ProjectService`, `AuditListener`, and the two integration test classes.
- If Docker is unavailable, use the labeled simulation and explain its limits.
