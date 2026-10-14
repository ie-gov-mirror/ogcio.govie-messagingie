import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

type BlacklistFileFormat = { profiles: string[] }

export const DEFAULT_BLACKLIST_ENVIRONMENT = "local"
export type BlacklistEnvironments =
  | "uat"
  | "dev"
  | "prod"
  | typeof DEFAULT_BLACKLIST_ENVIRONMENT

export function getBlacklist(params: {
  environment: BlacklistEnvironments
}): string[] {
  return loadBlacklistFile(params.environment).profiles ?? []
}

function loadBlacklistFile(
  environment: BlacklistEnvironments,
): BlacklistFileFormat {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const filePath = path.join(__dirname, "blacklists", `${environment}.json`)
  if (!existsSync(filePath)) {
    throw new Error("Doesn't exist a blacklist for this environment")
  }
  try {
    return JSON.parse(
      readFileSync(filePath, "utf-8") as string,
    ) as BlacklistFileFormat
  } catch {
    throw new Error("The blacklist for this environment is not a valid JSON")
  }
}
