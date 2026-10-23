/**
 * Error handling utility functions
 */

/**
 * Extracts error detail from SDK error response
 * Handles various error response structures
 */
export function extractSDKErrorDetail(
  errorObj: Record<string, unknown>,
): string {
  if (errorObj.detail) {
    return String(errorObj.detail);
  }
  if (errorObj.code) {
    return String(errorObj.code);
  }
  if (errorObj.errors) {
    return JSON.stringify(errorObj.errors);
  }
  return "Unknown error";
}
