import { readFile, writeFile } from "node:fs/promises";

const reports = [];
for (const name of ["gateway", "platform", "console"]) {
  const data = JSON.parse(await readFile(new URL(`../artifacts/${name}-security.json`, import.meta.url), "utf8"));
  const findings = (data.Results ?? []).flatMap(result => (result.Vulnerabilities ?? []).map(v => ({
    id: v.VulnerabilityID, package: v.PkgName, installed: v.InstalledVersion,
    fixed: v.FixedVersion ?? null, severity: v.Severity, target: result.Target,
  })));
  reports.push({ image: data.ArtifactName, createdAt: data.CreatedAt,
    imageId: data.Metadata?.ImageID, targets: (data.Results ?? []).map(r => ({ target: r.Target, type: r.Type })),
    high: findings.filter(f => f.severity === "HIGH").length,
    critical: findings.filter(f => f.severity === "CRITICAL").length,
    findings });
}
const report = { recordedAt: new Date().toISOString(), scanner: "Trivy runtime image scan",
  scope: "Gateway, platform, and console images; HIGH and CRITICAL severities",
  reports, note: "This is a point-in-time dependency scan, not a penetration test. Keycloak and database images are outside this report." };
await writeFile(new URL("../artifacts/security-summary.json", import.meta.url), JSON.stringify(report, null, 2));
console.table(reports.map(r => ({ image: r.image, high: r.high, critical: r.critical })));
if (reports.some(r => r.high || r.critical)) process.exitCode = 1;
