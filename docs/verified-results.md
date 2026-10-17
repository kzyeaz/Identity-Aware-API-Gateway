# Recorded demo verification

Recorded on **October 17, 2026** on the local Windows workstation with Docker Desktop’s Linux engine. These are local verification results, not production service-level measurements.

## Functional results

| Check | Result |
|---|---|
| Java tests | 15 passed; no failures or skipped tests |
| TypeScript SDK and simulator tests | 8 passed |
| Playwright browser scenarios | 2 passed in simulation, then 2 passed against the live stack |
| Live Keycloak / gateway / database smoke checks | 15 passed |
| TypeScript type checking and production builds | Passed |
| Runnable SDK example | Created a persisted project and listed projects for its identity |
| Desktop and mobile console | Inspected; mobile had no page-level horizontal overflow |

The live checks cover missing/malformed JWTs (401), insufficient scopes (403), invalid input (400), allowed reads (200), persisted writes (201), owner isolation (404), correlated MongoDB audit events, and per-identity Redis rate limits (429).

Evidence generated in the local workspace:

- `artifacts/java-verification.log`
- `services/*/target/surefire-reports/`
- `artifacts/live-smoke.json`
- `artifacts/console-desktop.png` and `artifacts/console-mobile.png`

## Coverage

| Java service | Line coverage | Branch coverage |
|---|---:|---:|
| Gateway | 97.44% | 90.00% |
| Platform | 98.25% | 100.00% |
| Weighted line total | **97.78%** | — |

JaCoCo measures all production classes in both Java modules, with no class exclusions. Maven’s verify phase enforces a minimum of 90% line coverage in **each** module. Frontend and SDK coverage is not included in this number.

The final framework stack is Spring Boot 4.1.1 / Spring Framework 7 with Spring Cloud 2025.1.3. Its tests use **JUnit 6 Jupiter and Testcontainers 2**, so the original résumé’s “JUnit 5” wording should be updated for this version.

Evidence: `artifacts/coverage.json` and each service’s `target/site/jacoco/index.html`. Reproduce with `mvn verify` followed by `npm run coverage:java`.

## Short load run

The final stack completed the included k6 scenario:

- Offered load: **3 project reads/second for 30 seconds**.
- Completed: **90 project reads**, plus one Keycloak token request.
- HTTP failure rate: **0%**.
- Project-read checks: **90/90 passed**.
- HTTP p95: **26.75 ms**.
- HTTP mean: **19.35 ms**.

The HTTP duration aggregates include the token request. The workload used one machine identity and stayed below its five-per-second quota. It ran locally on the same workstation as the services. This is a small repeatable smoke workload; it does not establish maximum capacity, 50,000 real daily requests, or 99.9% uptime.

Evidence: `artifacts/load-test.log` and `artifacts/load-summary.json`.

## Security scans

- `npm audit --audit-level=high`: **zero reported vulnerabilities**.
- Trivy scans of the gateway, platform, and console runtime images: **zero HIGH or CRITICAL findings** after dependency updates.
- Trivy filesystem vulnerability/secret scan: passed.

The runtime scans include packaged Java/Node libraries and the images’ OS packages. They exclude the third-party Keycloak, Redis, PostgreSQL, and MongoDB images. The reports are scoped to HIGH and CRITICAL severity, so they do not claim absence of all lower-severity issues.

Initial image scans found inherited dependency vulnerabilities that the npm application scan could not see. The resulting changes use a supported Spring 7 runtime, patched Jackson/Tomcat/Bouncy Castle versions, updated Alpine packages, and a console runtime without unused npm/Corepack/Yarn packages. No vulnerability-ignore entries were added.

Evidence: `artifacts/{gateway,platform,console}-security.json` and `artifacts/security-summary.json`, including image IDs and scan timestamps. The initial Java image findings are retained in `artifacts/*-security-before.json`. Re-run scans when dependencies or vulnerability databases change.

## What remains unmeasured

The Jenkins pipeline is implemented but has **not** been executed on a Jenkins installation. There is no long-running production traffic or uptime record, penetration test, disaster-recovery exercise, or high-availability deployment.

Generated reports are intentionally excluded from Git; Jenkins archives its own build results. Keep the recorded source revision and fresh reports together when presenting a future build.
