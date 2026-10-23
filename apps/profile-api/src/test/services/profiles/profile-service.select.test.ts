import type { Kysely } from "kysely";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB } from "~/db/schema.js";
import type { ProfileWithDetailsFromDb } from "~/schemas/profiles/model.js";
import { ProfileService } from "~/services/profiles/profile-service.js";

const { selectRows, getProfileDataMap } = vi.hoisted(() => ({
  selectRows: vi.fn(),
  getProfileDataMap: vi.fn(),
}));

vi.mock("~/models/profile-model.js", () => ({
  ProfileModel: class {
    selectRows = selectRows;
    getProfileDataMap = getProfileDataMap;
  },
}));

const row = {
  id: "profile-1",
  profileDetailsId: "details-1",
  publicName: "Ada Lovelace",
  email: "ada@example.com",
  primaryUserId: "profile-1",
  preferredLanguage: "en",
  status: "active",
} as ProfileWithDetailsFromDb;

describe("ProfileService.select", () => {
  beforeEach(() => {
    selectRows.mockReset().mockResolvedValue([row]);
    getProfileDataMap.mockReset().mockResolvedValue({
      "details-1": {
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
      },
    });
  });

  it("returns only ids and skips the details load when includeFullDetails is false", async () => {
    const result = await new ProfileService({} as Kysely<DB>).select({
      organizationId: "org",
      profileIds: ["profile-1"],
      consentSubjects: [],
      includeFullDetails: false,
    });

    expect(result).toEqual([{ id: "profile-1" }]);
    expect(getProfileDataMap).not.toHaveBeenCalled();
  });

  it("returns the full profile when includeFullDetails is omitted", async () => {
    const result = await new ProfileService({} as Kysely<DB>).select({
      organizationId: "org",
      profileIds: ["profile-1"],
      consentSubjects: [],
    });

    expect(getProfileDataMap).toHaveBeenCalledOnce();
    expect(result[0]?.publicName).toBe("Ada Lovelace");
    expect(result[0]?.details?.firstName).toBe("Ada");
    expect(result[0]?.email).toBe("ada@example.com");
  });
});
