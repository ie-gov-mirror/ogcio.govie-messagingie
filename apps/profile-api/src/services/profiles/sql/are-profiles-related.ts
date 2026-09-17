import type { Pool } from "pg";

export async function areProfilesRelated(
  pool: Pool,
  requesterId: string,
  requestedId: string,
): Promise<boolean> {
  const { rows } = await pool.query<{ related: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM profiles requester
        JOIN profiles requested ON requested.id = $2
        WHERE requester.id = $1
          AND requester.deleted_at IS NULL
          AND requested.deleted_at IS NULL
          AND (
            requester.primary_user_id = requested.primary_user_id
            OR EXISTS (
              SELECT 1
              FROM profile_details requester_details
              JOIN profile_data requester_ppsn
                ON requester_ppsn.profile_details_id = requester_details.id
                AND requester_ppsn.name = 'ppsn'
                AND requester_ppsn.value_type = 'string'
              JOIN profile_data requested_ppsn
                ON requested_ppsn.name = 'ppsn'
                AND requested_ppsn.value_type = 'string'
                AND requested_ppsn.value = requester_ppsn.value
              JOIN profile_details requested_details
                ON requested_details.id = requested_ppsn.profile_details_id
              WHERE requester_details.profile_id = requester.id
                AND requester_details.is_latest = true
                AND requested_details.profile_id = requested.id
                AND requested_details.is_latest = true
            )
          )
      ) AS related
    `,
    [requesterId, requestedId],
  );

  return rows[0]?.related ?? false;
}
