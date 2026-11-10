import { existsSync } from "node:fs"
import path from "node:path"
import type { ConnectionOptions } from "node:tls"

export const isSslEnabled = (flag: string): boolean => flag === "true"
export const getCaCertCandidates = (cwd: string): string[] => [
  path.join(cwd, "data/certificates/global-bundle.pem"),
]

export const resolveCaCertPath = (cwd: string): string => {
  const candidates = getCaCertCandidates(cwd)
  const found = candidates.find((candidate) => existsSync(candidate))
  if (!found) {
    throw new Error(
      `Postgres SSL is enabled but the CA bundle was not found. Looked in: ${candidates.join(", ")}`,
    )
  }
  return found
}

export const buildSslConfig = (
  enabled: boolean,
  ca: Buffer,
): ConnectionOptions | false => {
  if (!enabled) {
    return false
  }
  return {
    rejectUnauthorized: true,
    ca,
  }
}
