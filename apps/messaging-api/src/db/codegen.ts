import { fileURLToPath } from "node:url";
import { runCodegen } from "@ogcio/db-core/codegen";
import { getDbEnvs } from "../migrations/scripts/shared.js";
import {
  migrateContainer,
  startPostgresContainer,
} from "../test/build-testcontainer-pg.js";

// Regenerate src/db/schema.ts (Layer 1 DB row types) from a live Postgres schema.
//
// Two modes:
//   • Hermetic (default): boot a throwaway Postgres testcontainer, migrate it to
//     latest via the exact helpers the test-suite uses, introspect it, then stop
//     it. Needs Docker but no .env / running DB, and always reflects the latest
//     migrations — a local DB can silently drift (missing migration), so this is
//     the safe default.
//         pnpm --filter messaging-api db:codegen
//   • Local (CODEGEN_LOCAL=1): introspect an already-migrated DB pointed at by
//     DATABASE_TEST_URL / DATABASE_URL / .env after `pnpm db:prepare`. Faster and
//     Docker-free, but only as correct as the local DB's migration state.
//         pnpm --filter messaging-api db:codegen:local
const buildConnectionString = (): string => {
  if (process.env.DATABASE_TEST_URL) {
    return process.env.DATABASE_TEST_URL;
  }
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  const env = getDbEnvs();
  const auth = `${encodeURIComponent(env.POSTGRES_USER)}:${encodeURIComponent(
    env.POSTGRES_PASSWORD,
  )}`;
  return `postgresql://${auth}@${env.POSTGRES_HOST}:${env.POSTGRES_PORT}/${env.POSTGRES_DB_NAME}`;
};

const outFile = fileURLToPath(new URL("./schema.ts", import.meta.url));

const generate = (connectionString: string) =>
  runCodegen({ connectionString, outFile, camelCase: true });

try {
  if (process.env.CODEGEN_LOCAL === "1") {
    await generate(buildConnectionString());
  } else {
    const container = await startPostgresContainer();
    try {
      await migrateContainer(container);
      await generate(container.getConnectionUri());
    } finally {
      await container.stop();
    }
  }
  console.log(`Regenerated ${outFile}`);
} catch (error) {
  console.error("Schema codegen failed", error);
  process.exitCode = 1;
}
