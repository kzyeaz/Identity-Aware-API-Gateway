import { readFile, writeFile } from "node:fs/promises";

const modules = [];
for (const name of ["gateway", "platform"]) {
  const xml = await readFile(new URL(`../services/${name}/target/site/jacoco/jacoco.xml`, import.meta.url), "utf8");
  const counters = {};
  for (const type of ["LINE", "BRANCH", "INSTRUCTION"]) {
    // JaCoCo puts the report-wide counters last, after package/class counters.
    const matches = [...xml.matchAll(new RegExp(`<counter type="${type}" missed="(\\d+)" covered="(\\d+)"\\s*/>`, "g"))];
    if (!matches.length) throw new Error(`Missing ${type} counter in ${name}`);
    const [, missed, covered] = matches.at(-1);
    counters[type.toLowerCase()] = { missed: +missed, covered: +covered,
      percent: Math.round(+covered / (+covered + +missed) * 10000) / 100 };
  }
  modules.push({ name, ...counters });
}
const covered = modules.reduce((sum, module) => sum + module.line.covered, 0);
const missed = modules.reduce((sum, module) => sum + module.line.missed, 0);
const report = { recordedAt: new Date().toISOString(), scope: "All production Java classes in gateway and platform; no exclusions",
  modules, aggregateLinePercent: Math.round(covered / (covered + missed) * 10000) / 100,
  note: "Line coverage is not branch coverage. See the JaCoCo HTML reports for uncovered paths." };
await writeFile(new URL("../artifacts/coverage.json", import.meta.url), JSON.stringify(report, null, 2));
console.table(modules.map(module => ({ module: module.name, line: `${module.line.percent}%`, branch: `${module.branch.percent}%` })));
console.log(`Aggregate Java line coverage: ${report.aggregateLinePercent}%`);
if (modules.some(module => module.line.percent < 90)) process.exitCode = 1;
