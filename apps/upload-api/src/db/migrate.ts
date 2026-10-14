import { fileURLToPath } from "node:url";
import { runKyselyMigrateCli } from "@ogcio/db-core";

// Directory holding the Kysely TS migrations. `0001_baseline` reproduces the
// schema historically managed by Postgrator; all new migrations live here.
const migrationFolder = fileURLToPath(
  new URL("../migrations/kysely", import.meta.url),
);

// The CA bundle ships with the app; used only when POSTGRES_SSL is enabled.
const caCertPath = fileURLToPath(
  new URL("../certificates/global-bundle.pem", import.meta.url),
);

await runKyselyMigrateCli({
  migrationFolder,
  baselineName: "0001_baseline",
  caCertPath,
});
