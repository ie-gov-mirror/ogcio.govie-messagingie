import type { Pool } from "pg";

export enum CONFIG_TYPE {
  STRING = "string",
  NUMBER = "number",
  BOOLEAN = "boolean",
}

export const SCHEDULER_TOKEN = "SCHEDULER_TOKEN";
export const SCHEDULER_NEXT_RUN_AT = "SCHEDULER_NEXT_RUN_AT";

const storeConfig = (
  pool: Pool,
  key: string,
  value: number | string | boolean,
  description: string,
  type: CONFIG_TYPE,
) => {
  return pool.query(
    `
    INSERT INTO settings (key, value, type, description, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (key)
    DO UPDATE SET 
      value = EXCLUDED.value,
      type = EXCLUDED.type,
      description = EXCLUDED.description,
      updated_at = NOW();
    `,
    [key, value, type, description],
  );
};

// Writes only when the key is absent, so an existing value survives restarts.
const seedConfig = (
  pool: Pool,
  key: string,
  value: number | string | boolean,
  description: string,
  type: CONFIG_TYPE,
) => {
  return pool.query(
    `
    INSERT INTO settings (key, value, type, description, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (key) DO NOTHING;
    `,
    [key, value, type, description],
  );
};

// The conditional upsert only applies once the pending run is due, so
// concurrent replicas cannot both reserve the same slot.
const claimNextRun = async (pool: Pool, nextRunAt: Date) => {
  const result = await pool.query(
    `
    INSERT INTO settings (key, value, type, description, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (key)
    DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = NOW()
    WHERE settings.value::timestamptz <= NOW();
    `,
    [
      SCHEDULER_NEXT_RUN_AT,
      nextRunAt.toISOString(),
      CONFIG_TYPE.STRING,
      "execution time of the currently scheduled cleanup job",
    ],
  );

  return result.rowCount === 1;
};

const releaseNextRun = (pool: Pool) => {
  return pool.query(
    "UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2;",
    [new Date().toISOString(), SCHEDULER_NEXT_RUN_AT],
  );
};

const getConfigValue = async (pool: Pool, key: string) => {
  const valueQueryResult = await pool.query<{
    key: string;
    value: string;
    type: string;
  }>("SELECT key, value, type FROM settings WHERE key = $1", [key]);
  if (valueQueryResult.rows.length) {
    const { value, type } = valueQueryResult.rows[0];

    switch (type) {
      case CONFIG_TYPE.STRING: {
        return value;
      }
      case CONFIG_TYPE.NUMBER: {
        return parseInt(value, 10);
      }
      case CONFIG_TYPE.BOOLEAN: {
        return Boolean(value);
      }
    }
  }

  return undefined;
};

export {
  claimNextRun,
  getConfigValue,
  releaseNextRun,
  seedConfig,
  storeConfig,
};
