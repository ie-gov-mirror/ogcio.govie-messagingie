import { fileURLToPath } from "node:url";
import { runCodegen } from "@ogcio/db-core/codegen";
import { getDbEnvs } from "../migrations/scripts/shared.js";

// Regenerate src/db/schema.ts (Layer 1 DB row types) from the live schema of a
// running database. Point at a migrated dev/CI database via .env, then run
// `pnpm db:codegen`.
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

try {
  await runCodegen({
    connectionString: buildConnectionString(),
    outFile,
    camelCase: true,
  });
  console.log(`Regenerated ${outFile}`);
} catch (error) {
  console.error("Schema codegen failed", error);
  process.exitCode = 1;
}
