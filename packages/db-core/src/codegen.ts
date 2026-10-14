import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CodegenOptions {
  /** Postgres connection string to introspect. */
  connectionString: string;
  /** Absolute path of the generated schema file, e.g. `src/db/schema.ts`. */
  outFile: string;
  /**
   * Emit camelCase properties to match the {@link CamelCasePlugin} used by the
   * runtime Kysely instance. Defaults to `true`.
   */
  camelCase?: boolean;
  /** Additional raw CLI flags forwarded to `kysely-codegen`. */
  extraArgs?: string[];
  /** Working directory for the child process. Defaults to `process.cwd()`. */
  cwd?: string;
}

/**
 * Regenerate an API's `DB` interface from its live Postgres schema by shelling
 * out to the `kysely-codegen` CLI (which each consuming API installs). Keeps the
 * generated `src/db/schema.ts` in sync with the database after every migration.
 *
 * The generated types describe table rows only — they are Layer 1 (internal)
 * types consumed by BaseModel/services and must never feed frontend DTOs.
 */
export const runCodegen = async (options: CodegenOptions): Promise<void> => {
  const args = [
    "--url",
    options.connectionString,
    "--dialect",
    "postgres",
    "--out-file",
    options.outFile,
  ];
  if (options.camelCase ?? true) {
    args.push("--camel-case");
  }
  if (options.extraArgs) {
    args.push(...options.extraArgs);
  }

  const { stdout, stderr } = await execFileAsync("kysely-codegen", args, {
    cwd: options.cwd ?? process.cwd(),
    env: process.env,
  });
  if (stdout) {
    console.log(stdout.trim());
  }
  if (stderr) {
    console.error(stderr.trim());
  }
};
