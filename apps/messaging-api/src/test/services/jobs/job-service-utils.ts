import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  RunningJob,
  ScheduledMessageStatus,
} from "../../../services/jobs/job-service.js";
import type { AvailableTransports } from "../../../services/users/shared-users.js";
import { JobTypes } from "../../../types/jobs.js";
import type { SecurityLevels } from "../../../types/security-levels.js";
import { getCurrentUTCDate } from "../../../utils/date-times.js";
import { utils } from "../../../utils/utils.js";

export async function deleteJobsAndRelatedForOrganization(
  pool: Pool,
  organizationId: string,
) {
  await pool.query("DELETE FROM messages where organisation_id = $1;", [
    organizationId,
  ]);
  await pool.query("DELETE FROM jobs where organisation_id = $1;", [
    organizationId,
  ]);
  await pool.query("DELETE FROM email_providers where organisation_id = $1;", [
    organizationId,
  ]);
}

export async function insertMockJob({
  pool,
  organizationId,
  userId,
  entityId,
  status,
}: {
  pool: Pool;
  organizationId: string;
  userId?: string;
  entityId?: string;
  status?: ScheduledMessageStatus;
}): Promise<{
  jobId: string;
  userId: string;
  entityId: string;
  token: string;
}> {
  status = status ?? "pending";
  userId = userId ?? randomUUID().substring(0, 11);
  entityId = entityId ?? randomUUID();
  const token = randomUUID();
  const jobInsertResult = await pool.query<{
    jobId: string;
    userId: string;
    entityId: string;
    token: string;
  }>(
    `
          insert into jobs(job_type, organisation_id, job_id, user_id, job_token, delivery_status)
          values ($1, $2, $3, $4, $5, $6)
          returning id as "jobId", user_id as "userId", job_id as "entityId", job_token as "token"
        `,
    [JobTypes.Message, organizationId, entityId, userId, token, status],
  );
  return jobInsertResult.rows[0];
}

export async function insertMockMessage({
  pool,
  organizationId,
  transports,
  securityLevel,
  subject,
}: {
  pool: Pool;
  organizationId: string;
  transports: AvailableTransports[];
  securityLevel?: SecurityLevels;
  subject?: string;
}): Promise<{ id: string; user_id: string; organisation_id: string }> {
  const valueArray = [
    false,
    randomUUID().substring(0, 11),
    subject ?? "subject",
    "Exc",
    "plain",
    "rich",
    securityLevel ?? "public",
    "en",
    utils.postgresArrayify(transports),
    "threadName",
    organizationId,
    getCurrentUTCDate(),
    `externalId-${randomUUID()}`,
  ];

  const values = valueArray.map((_, i) => `$${i + 1}`).join(", ");
  const insertQueryResult = await pool.query<{
    id: string;
    user_id: string;
    organisation_id: string;
  }>(
    `
                insert into messages(
                    is_delivered,
                    user_id,
                    subject,
                    excerpt,
                    plain_text,
                    rich_text,
                    security_level,
                    lang,
                    preferred_transports,
                    thread_name,
                    organisation_id,
                    scheduled_at,
                    external_id
                ) values (${values})
                returning 
                  id, user_id, organisation_id;
              `,
    valueArray,
  );

  return insertQueryResult.rows[0];
}

export async function getJob(
  pool: Pool,
  jobId: string,
  orgId: string,
): Promise<RunningJob | undefined> {
  const jobs = await pool.query<RunningJob>(
    `
         SELECT user_id as "userId",
        job_type as "type",
        job_id as "jobId",
        organisation_id as "organizationId",
        delivery_status as "status"
         from jobs
        WHERE organisation_id = $1 AND id = $2
        `,
    [orgId, jobId],
  );

  return jobs.rows.at(0);
}

type HelperMessage = {
  id: string;
  userId: string;
  delivered: boolean;
};

export async function getMessage(
  pool: Pool,
  userId: string,
  messageId: string,
): Promise<HelperMessage | undefined> {
  const jobs = await pool.query<HelperMessage>(
    `
           SELECT user_id as "userId",
          is_delivered as "delivered",
          id as "messageId"
           from messages
          WHERE user_id = $1 AND id = $2
          `,
    [userId, messageId],
  );

  return jobs.rows.at(0);
}
