import type { FastifyInstance } from "fastify";
import { getSchedulerSdk } from "./authentication-factory.js";
import {
  claimNextRun,
  getConfigValue,
  releaseNextRun,
  SCHEDULER_TOKEN,
} from "./storeConfig.js";

const scheduleCleanupTask = async (app: FastifyInstance) => {
  /**
   * The org id is hardcoded for now,
   * we will change this in the future once we have a better m2m management
   */
  const schedulerSdk = await getSchedulerSdk(
    app.config.ORGANIZATION_ID as string,
    app.log,
  );

  const schedulerToken = (await getConfigValue(
    app.pg.pool,
    SCHEDULER_TOKEN,
  )) as string;

  const hoursInterval = app.config.SCHEDULED_JOBS_HOURS_INTERVAL as number;
  const scheduleDate = new Date();
  scheduleDate.setHours(scheduleDate.getHours() + hoursInterval);

  // Keeps one job in flight: restarts must not stack up parallel cleanup chains.
  if (!(await claimNextRun(app.pg.pool, scheduleDate))) {
    app.log.info("Cleanup job already scheduled, skipping");
    return;
  }

  try {
    await schedulerSdk.scheduleTasks([
      {
        executeAt: scheduleDate.toISOString(),
        webhookUrl: new URL(
          "/api/v1/jobs",
          app.config.HOST as string,
        ).toString(),
        webhookAuth: schedulerToken,
      },
    ]);

    app.log.info(`Scheduled next job at: ${scheduleDate.toISOString()}`);
  } catch (err) {
    await releaseNextRun(app.pg.pool).catch(() => {});
    app.log.error(err);
  }
};

export default scheduleCleanupTask;
