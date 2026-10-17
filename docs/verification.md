# Verification and CI

## Required tools

- Node.js 22.15+ and npm.
- JDK 17+ (CI/runtime use 21), Maven 3.9+.
- Docker Desktop or a Linux Docker daemon for integration tests.
- Chromium via `npx playwright install chromium`.
- Trivy on the Jenkins agent.

`scripts/verify.ps1` runs the Node and Java checks on Windows. A local Maven download in `.tools` is an optional convenience; it is not part of the committed project.

## Test strategy

Gateway tests start Redis with Testcontainers and a real local JWKS HTTP server. Tokens are RSA-signed in the test process; malformed, expired, incorrectly signed, wrong-issuer, and wrong-audience tokens are rejected through the actual decoder and HTTP security chain. The upstream HTTP server is a deterministic proxy target, not a substitute for Redis.

Platform tests start PostgreSQL and MongoDB with Testcontainers. Spring Security test support supplies authenticated JWT principals for controller/persistence scenarios. The gateway suite and live stack exercise cryptographic verification. Mockito is limited to failure cases such as database write failure and audit delivery failure.

Spring Boot 4 / Framework 7 require the JUnit 6 extension API. The suite uses the same Jupiter annotations familiar from JUnit 5, with Testcontainers 2 modules. The platform additionally tests its own decoder with signed tokens and a real JWKS endpoint.

Playwright drives the real Next.js UI and API routes. The managed test server defaults to simulation. With a live console already on port 3000, the same tests can exercise real services; record which mode you used.

The live smoke test talks directly to Keycloak and the gateway. It requires no mock tokens and saves a timestamped report without access tokens or secrets.

## Coverage

Run `mvn clean verify`. JaCoCo produces HTML, CSV, and XML reports under each service’s `target/site/jacoco`.

Line coverage and branch coverage are different measurements. Aggregate coverage is the sum of covered counters divided by the sum of covered plus missed counters, not the mean of the module percentages.

The Maven verify phase fails below 90% line coverage in either Java service. There are no production-class exclusions. Run `npm run coverage:java` after verification to write the weighted total and per-module line/branch results to `artifacts/coverage.json`.

The generated target directories and artifacts are excluded from source control. Preserve reports as CI artifacts when sharing a build. Record the commit ID, environment, and date alongside any résumé metric.

## Jenkins

Create a Pipeline from SCM job pointing to `Jenkinsfile`. The Linux agent needs:

1. Java, Maven, Node, npm, Docker, Trivy, and required browser libraries.
2. Permission for the Jenkins account to access its Docker daemon.
3. Outbound access to Maven/npm registries, container registries, and Trivy’s vulnerability database.
4. The Pipeline and JUnit plugins; artifact archiving uses Jenkins core functionality.

The pipeline runs Java verification, console/SDK checks, browser tests, `npm audit`, Trivy filesystem vulnerability/secret scanning, deployable image builds, and runtime image scans. It archives JUnit results, JaCoCo reports, scan JSON, and browser failure traces. It does not deploy or publish images.

The filesystem scan uses offline dependency resolution and skips Maven POMs to avoid resolving entire BOM trees from Maven Central. The subsequent image scans inspect the actual packaged Java libraries and OS dependencies. A successful npm audit is not evidence that Java or container OS dependencies are clean. To run the same image checks locally:

```sh
trivy image --severity HIGH,CRITICAL --exit-code 1 identity-demo-gateway
trivy image --severity HIGH,CRITICAL --exit-code 1 identity-demo-platform
trivy image --severity HIGH,CRITICAL --exit-code 1 identity-demo-console
```

Security databases change; a previously successful scan may later fail. Review findings and update dependencies rather than suppressing the gate to maintain a badge.

## Load demonstration

With the stack running and no concurrent traffic:

```sh
k6 run scripts/load.js
```

The included scenario requests three project reads per second for 30 seconds. It stays below the five-per-second identity quota and checks success rate and p95 latency. These thresholds are proposed acceptance criteria, not pre-recorded results.

For Docker on Windows/macOS:

```sh
docker run --rm -v "${PWD}/scripts:/scripts" \
  -e BASE_URL=http://host.docker.internal:8088 \
  -e KEYCLOAK_URL=http://host.docker.internal:8180 \
  grafana/k6 run /scripts/load.js
```

PowerShell uses backticks rather than backslashes for line continuation; alternatively put the command on one line.

Do not increase a single identity’s offered load and interpret expected 429s as raw backend capacity failures. Benchmark capacity separately from quota correctness using representative identities and traffic. Keep the hardware, duration, request mix, concurrency, and error definitions with the results.

## Availability

No uptime percentage is established by these tests. A meaningful 99.9% objective needs externally observed availability, a time window, and a documented definition of successful service. A single-instance local Compose stack has no failover.
