import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stampBaseline = vi.fn();
const migrateToLatest = vi.fn();
vi.mock("@ogcio/db-core", () => ({
  createDbFromPool: vi.fn(() => ({})),
  migrateToLatest: (...args: unknown[]) => migrateToLatest(...args),
  stampBaseline: (...args: unknown[]) => stampBaseline(...args),
}));

const doMigration = vi.fn();
vi.mock("~/migrations/scripts/migrate.js", () => ({
  doMigration: (...args: unknown[]) => doMigration(...args),
}));

const seedConsentStatements = vi.fn();
vi.mock("~/migrations/scripts/seed-consent-statements.js", () => ({
  seedConsentStatements: (...args: unknown[]) => seedConsentStatements(...args),
}));

const syncProfileConsents = vi.fn();
vi.mock("~/migrations/scripts/sync-profile-consents.js", () => ({
  syncProfileConsents: (...args: unknown[]) => syncProfileConsents(...args),
}));

const normalizeDateOfBirth = vi.fn();
vi.mock("~/services/profiles/normalize-date-of-birth.js", () => ({
  normalizeDateOfBirth: (...args: unknown[]) => normalizeDateOfBirth(...args),
}));

const poolEnd = vi.fn();
vi.mock("~/migrations/scripts/shared.js", () => ({
  getDbEnvs: vi.fn(() => ({ POSTGRES_DB_NAME: "test" })),
  getPgConnection: vi.fn(() => ({ end: poolEnd })),
}));

class ExitSentinel extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
  }
}

// ci-job runs at import and always ends in process.exit; capture the code.
const runCiJob = async (): Promise<number> => {
  vi.resetModules();
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
    code: number,
  ) => {
    throw new ExitSentinel(code);
  }) as never);
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await import("~/scripts/ci-job.js");
    throw new Error("ci-job did not exit");
  } catch (error) {
    if (error instanceof ExitSentinel) {
      return error.code;
    }
    throw error;
  } finally {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  }
};

describe("ci-job", () => {
  const savedArgv = [...process.argv];

  beforeEach(() => {
    vi.clearAllMocks();
    stampBaseline.mockResolvedValue(undefined);
    migrateToLatest.mockResolvedValue(undefined);
    doMigration.mockResolvedValue(undefined);
    seedConsentStatements.mockResolvedValue(undefined);
    syncProfileConsents.mockResolvedValue(undefined);
    normalizeDateOfBirth.mockResolvedValue(undefined);
    poolEnd.mockResolvedValue(undefined);
    process.argv = savedArgv.filter((a) => a !== "--enable-format-dates");
  });

  afterEach(() => {
    process.argv = [...savedArgv];
  });

  it("runs migration, seed and sync then exits 0", async () => {
    await expect(runCiJob()).resolves.toBe(0);
    expect(doMigration).toHaveBeenCalledTimes(1);
    expect(seedConsentStatements).toHaveBeenCalledTimes(1);
    expect(syncProfileConsents).toHaveBeenCalledTimes(1);
    expect(normalizeDateOfBirth).not.toHaveBeenCalled();
    expect(poolEnd).toHaveBeenCalledTimes(1);
  });

  it("normalizes dates when --enable-format-dates is passed", async () => {
    process.argv = [...process.argv, "--enable-format-dates"];
    await expect(runCiJob()).resolves.toBe(0);
    expect(normalizeDateOfBirth).toHaveBeenCalledTimes(1);
  });

  it("exits 1 when the migration fails", async () => {
    doMigration.mockRejectedValue(new Error("migration failed"));
    await expect(runCiJob()).resolves.toBe(1);
    expect(seedConsentStatements).not.toHaveBeenCalled();
  });

  it("exits 1 when seeding consent statements fails", async () => {
    seedConsentStatements.mockRejectedValue(new Error("seed failed"));
    await expect(runCiJob()).resolves.toBe(1);
    expect(syncProfileConsents).not.toHaveBeenCalled();
  });

  it("exits 1 when syncing profile consents fails", async () => {
    syncProfileConsents.mockRejectedValue(new Error("sync failed"));
    await expect(runCiJob()).resolves.toBe(1);
  });

  it("exits 1 when normalizing dates fails", async () => {
    process.argv = [...process.argv, "--enable-format-dates"];
    normalizeDateOfBirth.mockRejectedValue(new Error("normalize failed"));
    await expect(runCiJob()).resolves.toBe(1);
  });
});
