import type { FastifyInstance } from "fastify";
import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { autoConfig } from "~/plugins/external/pg.js";
import { scheduleImportProfiles } from "~/services/profiles/imports/import-profiles.js";
import { mockLogger, mockLogtoConfig } from "~/test/fixtures/common.js";

vi.mock("~/services/profiles/create-logto-users.js", () => ({
  createLogtoUsers: vi.fn(async () => [
    { id: "user-1", primaryEmail: "pool-import@example.com" },
  ]),
}));

vi.mock("~/services/profiles/sql/create-profile-import.js", () => ({
  createProfileImport: vi.fn(async () => ({
    jobToken: "job-token",
    profileImportId: "import-1",
  })),
}));

vi.mock("~/services/profiles/sql/create-profile-import-details.js", () => ({
  createProfileImportDetails: vi.fn(async () => ["detail-1"]),
}));

vi.mock("~/services/profiles/sql/get-profile-import.js", () => ({
  getProfileImport: vi.fn(async () => ({
    organisationId: "org-1",
    metadata: {},
    status: "pending",
    createdAt: "2026-10-02T00:00:00.000Z",
  })),
}));

vi.mock("~/services/profiles/sql/get-profile-import-details.js", () => ({
  getProfileImportDetails: vi.fn(async () => [
    {
      id: "detail-1",
      status: "pending",
      batch: 0,
      email: "pool-import@example.com",
      firstName: "Pool",
      lastName: "Import",
    },
  ]),
}));

vi.mock("~/services/profiles/sql/lookup-profile.js", () => ({
  lookupProfilesBulk: vi.fn(async () => new Map()),
}));

vi.mock(
  "~/services/profiles/sql/update-profile-import-details-status.js",
  () => ({
    updateProfileImportDetailsStatus: vi.fn(async () => undefined),
  }),
);

vi.mock("~/services/profiles/sql/update-profile-import-details.js", () => ({
  updateProfileImportDetails: vi.fn(async () => undefined),
}));

vi.mock("~/services/profiles/sql/update-profile-import-status.js", () => ({
  updateProfileImportStatus: vi.fn(async () => undefined),
}));

vi.mock("~/services/profiles/sql/get-profile-import-status.js", () => ({
  getProfileImportStatus: vi.fn(async () => "pending"),
}));

vi.mock("~/services/profiles/sql/check-profile-import-completion.js", () => ({
  checkProfileImportCompletion: vi.fn(async () => ({
    isComplete: true,
    finalStatus: "pending",
  })),
}));

vi.mock("~/utils/authentication-factory.js", () => ({
  getOrgAnalyticsSdk: vi.fn(async () => ({
    track: { event: vi.fn() },
  })),
  getOrgSchedulerSdk: vi.fn(),
}));

const POOL_MAX = 10;
const CHECKOUT_TIMEOUT_MS = 500;

const createMaxPool = (max: number) => {
  let inUse = 0;
  let peak = 0;
  const waiters: Array<() => void> = [];

  const connect = (): Promise<PoolClient> =>
    new Promise((resolve, reject) => {
      let settled = false;
      const acquire = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        inUse += 1;
        peak = Math.max(peak, inUse);
        let released = false;
        resolve({
          query: vi.fn(async () => ({
            rows: [{ in_transaction: false }],
            rowCount: 1,
          })),
          release: () => {
            if (released) {
              return;
            }
            released = true;
            inUse -= 1;
            waiters.shift()?.();
          },
        } as unknown as PoolClient);
      };
      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        const index = waiters.indexOf(acquire);
        if (index >= 0) {
          waiters.splice(index, 1);
        }
        reject(new Error("timeout exceeded when trying to connect"));
      }, CHECKOUT_TIMEOUT_MS);

      if (inUse < max) {
        acquire();
      } else {
        waiters.push(acquire);
      }
    });

  return {
    pool: { connect } as unknown as Pool,
    peak: () => peak,
  };
};

describe("immediate profile import pool", () => {
  it("does not deadlock more than 5 one-profile imports on a max-10 pool", async () => {
    const { pool, peak } = createMaxPool(POOL_MAX);
    const concurrency = 6;

    const results = await Promise.all(
      Array.from({ length: concurrency }, () =>
        scheduleImportProfiles({
          pool,
          logger: mockLogger,
          organizationId: "org-1",
          config: mockLogtoConfig,
          source: "json",
          profiles: [
            {
              email: "pool-import@example.com",
              firstName: "Pool",
              lastName: "Import",
            },
          ],
          immediate: true,
          insertPrivateDetails: false,
          onlyPrivateDetails: false,
        }),
      ),
    );

    expect(results).toHaveLength(concurrency);
    expect(peak()).toBeLessThanOrEqual(concurrency);
  });

  it("gives the pool a finite checkout timeout and does not raise max", () => {
    const previous = process.env.DATABASE_TEST_URL;
    delete process.env.DATABASE_TEST_URL;
    try {
      const config = autoConfig({
        config: {
          POSTGRES_SSL: false,
          POSTGRES_HOST: "localhost",
          POSTGRES_PORT: 5432,
          POSTGRES_USER: "user",
          POSTGRES_PASSWORD: "password",
          POSTGRES_DATABASE: "profile",
        },
      } as unknown as FastifyInstance);

      expect(config.connectionTimeoutMillis).toBeGreaterThan(0);
      expect(config.connectionTimeoutMillis).toBeLessThanOrEqual(10_000);
      expect(config.max ?? POOL_MAX).toBeLessThanOrEqual(POOL_MAX);
    } finally {
      if (previous === undefined) {
        delete process.env.DATABASE_TEST_URL;
      } else {
        process.env.DATABASE_TEST_URL = previous;
      }
    }
  });
});
