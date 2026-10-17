// Run: k6 run scripts/load.js
// Docker: docker run --rm -v "$PWD/scripts:/scripts" -e BASE_URL=http://host.docker.internal:8088
//   -e KEYCLOAK_URL=http://host.docker.internal:8180 grafana/k6 run /scripts/load.js
import http from "k6/http";
import { check } from "k6";
export const options = {
  scenarios: { steady: { executor: "constant-arrival-rate", rate: 3, timeUnit: "1s", duration: "30s", preAllocatedVUs: 5, maxVUs: 10 } },
  thresholds: { http_req_failed: ["rate<0.01"], http_req_duration: ["p(95)<500"], checks: ["rate>0.99"] },
};
export function setup() {
  const result = http.post(`${__ENV.KEYCLOAK_URL || "http://localhost:8180"}/realms/identity/protocol/openid-connect/token`, {
    grant_type: "client_credentials", client_id: "demo-writer", client_secret: __ENV.WRITER_SECRET || "writer-local-only",
  });
  if (result.status !== 200) throw new Error("Keycloak token issuance failed");
  return { token: result.json("access_token") };
}
export default function (data) {
  const result = http.get(`${__ENV.BASE_URL || "http://localhost:8088"}/api/projects`, { headers: { Authorization: `Bearer ${data.token}` } });
  check(result, { "project read succeeds": r => r.status === 200 });
}
