import type { DbEnv } from "@ogcio/db-core";
import closeWithGrace from "close-with-grace";
import type { Pool } from "pg";
import pino from "pino";
import { getPgConnection } from "~/migrations/scripts/shared.js";
import type {
  DPProxyConfig,
  LogtoManagementConfig,
  M2MSdksConfig,
} from "~/plugins/external/env.js";
import { getIntervalSeconds, getTaskTimeoutMs } from "./config.js";
import { executeTask } from "./execute-task.js";
import { writeHeartbeat } from "./heartbeat.js";
import { resolveStuckTasks } from "./resolve-stuck-tasks.js";
import { IS_STUCK_AFTER_MINUTES } from "./types.js";
import { withTimeout } from "./with-timeout.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Install process-level guards so the worker can never die (or hang) silently.
 * An unhandled rejection or uncaught exception is logged and the process exits
 * non-zero, so Kubernetes restarts it — failing loud instead of leaving a dead
 * pod that still reports "Running".
 */
function installProcessSafetyHandlers(logger: pino.Logger): void {
  process.on("unhandledRejection", (reason) => {
    logger.fatal(
      {
        message: "Unhandled promise rejection in lifecycle worker, exiting",
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      },
      "unhandledRejection",
    );
    process.exit(1);
  });

  process.on("uncaughtException", (error) => {
    logger.fatal(
      {
        message: "Uncaught exception in lifecycle worker, exiting",
        error: error.message,
        stack: error.stack,
      },
      "uncaughtException",
    );
    process.exit(1);
  });
}

export async function startWorkerLoop(params: {
  envDbConfig: DbEnv;
  logtoManagementConfig: LogtoManagementConfig;
  dpProxyConfig: Required<DPProxyConfig>;
  m2mSdksConfig: M2MSdksConfig;
}): Promise<void> {
  const logger = pino.pino();
  installProcessSafetyHandlers(logger);

  const intervalSeconds = getIntervalSeconds();
  const intervalMs = intervalSeconds * 1000;
  const taskTimeoutMs = getTaskTimeoutMs();
  const pool = await connectToDatabase(params.envDbConfig, logger);

  let running = true;
  let taskPromise: Promise<void> | null = null;

  logger.info({
    message: "Starting lifecycle worker",
    intervalSeconds,
    taskTimeoutMs,
  });

  // Emit an initial heartbeat so the liveness probe has a fresh value before
  // the first (potentially long) task starts.
  writeHeartbeat();

  // Bound graceful shutdown: wait for an in-flight task up to the task timeout
  // plus one interval, then let Kubernetes' SIGKILL take over. Previously this
  // used MAX_SIGNED_INTEGER (~24 days), which could hang a rollout on a stuck
  // task.
  const shutdownDelayMs = taskTimeoutMs + intervalMs;
  closeWithGrace({ delay: shutdownDelayMs }, async ({ signal }) => {
    logger.info({
      message: "Received shutdown signal, waiting for current task to complete",
      signal,
    });
    running = false;

    if (taskPromise) {
      await taskPromise;
    }
    await pool.end();
    logger.info({ message: "Shutdown complete" });
  });

  while (running) {
    // Heartbeat before each task so the liveness probe reflects loop progress.
    writeHeartbeat();

    try {
      // A single task is time-bounded so one hung external call (upload,
      // messaging, zip stream) can never stall the single-flight loop forever.
      taskPromise = withTimeout(
        executeTask({
          logger,
          pool,
          dpProxyConfig: params.dpProxyConfig,
          logtoConfig: params.logtoManagementConfig,
          m2mSdksConfig: params.m2mSdksConfig,
        }),
        taskTimeoutMs,
        "executeTask",
      );
      await taskPromise;
      taskPromise = null;
    } catch (error) {
      taskPromise = null;
      logger.error({
        message: "Error executing lifecycle task",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Continue to next interval on error (including task timeouts). The task
      // row remains in 'processing' and is reclaimed by resolveStuckTasks.
    }

    await resolveStuckTasks({
      pool,
      logger,
      isStuckAfterMinutes: IS_STUCK_AFTER_MINUTES,
    });

    // Heartbeat after finishing the iteration's work.
    writeHeartbeat();

    // Only sleep if we're still running
    if (running) {
      await sleep(intervalMs);
    }
  }
}

async function connectToDatabase(
  dbConfig: DbEnv,
  logger: pino.Logger,
): Promise<Pool> {
  const connectionString = process.env.DATABASE_TEST_URL?.length
    ? process.env.DATABASE_TEST_URL
    : undefined;
  const pool = getPgConnection(connectionString ?? dbConfig, {
    idleTimeoutMillis: 3000,
  });

  try {
    await pool.query("SELECT 1"); // Test the connection
  } catch (error) {
    logger.fatal({ error }, "Failed to connect to the database:");
    throw error;
  }

  return pool;
}
