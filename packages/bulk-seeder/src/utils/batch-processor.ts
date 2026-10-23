/**
 * Batch processing utility functions
 */

/**
 * Processes items in batches with progress logging
 * @param items - Array of items to process
 * @param batchSize - Number of items per batch
 * @param processor - Function to process each batch
 * @param operation - Operation name for logging
 * @returns Promise that resolves when all batches are processed
 */
export async function processInBatchesWithProgress<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>,
  operation: string,
): Promise<R[]> {
  const results: R[] = [];
  let processedCount = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...batchResults);
    processedCount += batch.length;
    console.log(
      `[Seeder] Processed ${processedCount}/${items.length} items for ${operation}`,
    );
  }

  return results;
}
