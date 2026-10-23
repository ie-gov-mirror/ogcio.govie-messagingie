import { seeder } from "./src/seeder.js";

/**
 * Main entry point for the seeder script
 */
async function main(): Promise<void> {
  try {
    await seeder();
    process.exit(0);
  } catch (error) {
    console.error(`[Seeder] Fatal error: ${(error as Error).message}`);
    process.exit(1);
  }
}

main();
