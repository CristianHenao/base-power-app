/** Run from the repository root: node docs/data-models/export-fixtures.mjs */
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const result = await build({
  absWorkingDir: repositoryRoot,
  entryPoints: ["src/lib/fixtures/risk-data.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const fixtures = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
const examplesDirectory = new URL("./examples/", import.meta.url);
await mkdir(examplesDirectory, { recursive: true });

const outputs = {
  "report-request.json": fixtures.reportRequest,
  "risk-report.json": fixtures.exampleReport,
  "source-examples.json": { dataMode: "synthetic", sources: fixtures.sourceCatalog, records: fixtures.sourceExamples },
  "edge-cases.json": {
    dataMode: "synthetic",
    // These are component fixtures, not complete RiskReport responses.
    noAlerts: fixtures.noAlertsExample,
    staleThreats: fixtures.partialReport.weather.current,
    gridUnavailable: fixtures.partialReport.grid.live,
    approximateLocation: fixtures.approximateLocationReport.location,
    zoneAlertWithoutPolygon: fixtures.zoneAlertExample,
    missingOutageObservation: fixtures.missingObservationExample,
    meterUsageWithMissingInterval: fixtures.sourceExamples.smart_meter_texas,
    requestError: fixtures.errorExample,
  },
};
for (const [name, payload] of Object.entries(outputs)) {
  await writeFile(new URL(name, examplesDirectory), `${JSON.stringify(payload, null, 2)}\n`);
}
console.log(`Exported ${Object.keys(outputs).length} synthetic JSON fixtures.`);
