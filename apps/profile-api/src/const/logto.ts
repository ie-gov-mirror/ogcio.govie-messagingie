const MY_GOV_ID_IDENTITY = "MyGovId (MyGovId connector)";
const ENTRA_ID_IDENTITY = "OGCIO EntraID";

/** Citizen resource role assigned at sign-up. Holds `profile:user.self:write`. */
const BB_CITIZEN_ROLE_ID = "bb-citizen";

/** Logto resource role granted after citizen onboarding (SAFE ≥ 2). */
const ONBOARDED_CITIZEN_ROLE_ID = "onboarded-citizen";

/**
 * Bootstrap role assigned at sign-up; holds `profile:user.onboarding:read` only.
 * Removed by profile-api after successful onboarding (profile-next flow).
 * Legacy `apps/profile` onboarding assigns `onboarded-citizen` directly via
 * the Management API and does not call POST /api/v1/onboarding — removal here
 * is best-effort and idempotent when that role was never assigned.
 */
const ONBOARDING_CANDIDATE_ROLE_ID = "onboarding-candidate";

export {
  BB_CITIZEN_ROLE_ID,
  ENTRA_ID_IDENTITY,
  MY_GOV_ID_IDENTITY,
  ONBOARDED_CITIZEN_ROLE_ID,
  ONBOARDING_CANDIDATE_ROLE_ID,
};
