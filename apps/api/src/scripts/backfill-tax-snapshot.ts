import { runBackfillTaxSnapshots } from "../modules/fiscal/backfill-tax-snapshot.service.js";

export { runBackfillTaxSnapshots } from "../modules/fiscal/backfill-tax-snapshot.service.js";
export type {
  BackfillOptions,
  BackfillSummary,
} from "../modules/fiscal/backfill-tax-snapshot.service.js";

const isCli =
  !!process.argv[1] &&
  (process.argv[1].endsWith("backfill-tax-snapshot.ts") ||
    process.argv[1].includes("backfill-tax-snapshot"));

if (isCli) {
  runBackfillTaxSnapshots({
    days: 90,
    tenantSlug: "piloto-sp",
    dryRun: process.argv.includes("--dry-run"),
  })
    .then((s) => {
      console.log(JSON.stringify(s, null, 2));
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
