/**
 * SDK-related utility functions
 */

/**
 * Extracts profile import ID from SDK response
 * Handles different response structures from the profile import API
 */
export function getProfileImportId(result: object): string | null {
  if (
    "data" in result &&
    typeof result.data === "object" &&
    result.data !== null &&
    "profileImportId" in result.data
  ) {
    return result.data.profileImportId as string;
  }
  if (
    "profileImportId" in result &&
    typeof result.profileImportId === "string"
  ) {
    return result.profileImportId;
  }
  return null;
}

/**
 * Sleep utility for polling and delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
