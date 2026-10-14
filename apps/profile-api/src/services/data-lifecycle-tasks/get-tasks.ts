import type { Pool } from "pg";
import type { GetLifecycleTask } from "~/schemas/data-lifecycle-tasks/get-many-user-export.js";
import { lifecycleTaskServiceFromPool } from "./lifecycle-task-service.js";

export async function getTasks({
  profileId,
  pgpool,
  taskType,
}: {
  profileId: string | null;
  pgpool: Pool;
  taskType: string | null;
}): Promise<GetLifecycleTask[]> {
  return lifecycleTaskServiceFromPool(pgpool).getTasks({ profileId, taskType });
}
