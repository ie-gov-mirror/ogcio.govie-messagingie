/**
 * Logging utility functions
 */

/**
 * Logs progress for batch processing operations
 */
export function logProgress(
  processedCount: number,
  totalCount: number,
  operation: string,
): void {
  console.log(
    `[Seeder] Processed ${processedCount}/${totalCount} profiles for ${operation}`,
  );
}

/**
 * Logs completion summary with success and error counts
 */
export function logCompletionSummary(
  operation: string,
  successCount: number,
  errorCount: number,
): void {
  console.log(
    `[Seeder] ${operation} completed: ${successCount} successful, ${errorCount} errors`,
  );
}
