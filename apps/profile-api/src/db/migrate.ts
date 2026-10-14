import { fileURLToPath } from "node:url";
import { runKyselyMigrateCli } from "@ogcio/db-core";
import { getDbEnvs } from "~/migrations/scripts/shared.js";

// Directory holding the Kysely TS migrations. `0001_baseline` reproduces the
// schema historically managed by Postgrator; all new migrations live here.
const migrationFolder = fileURLToPath(
  new URL("../migrations/kysely", import.meta.url),
);

// The CA bundle ships with the app; used only when POSTGRES_SSL is enabled.
const caCertPath = fileURLToPath(
  new URL("../certificates/global-bundle.pem", import.meta.url),
);

// `getDbEnvs()` bridges profile-api's `POSTGRES_DATABASE` to db-core's
// `POSTGRES_DB_NAME`; a `DATABASE_TEST_URL` connection string wins when set.
await runKyselyMigrateCli({
  migrationFolder,
  baselineName: "0001_baseline",
  connection: process.env.DATABASE_TEST_URL ?? getDbEnvs(),
  caCertPath,
});
