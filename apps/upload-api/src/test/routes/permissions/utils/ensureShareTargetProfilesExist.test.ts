import type { FastifyBaseLogger } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureShareTargetProfilesExist } from "../../../../routes/permissions/utils/ensureShareTargetProfilesExist.js";

const { selectProfiles } = vi.hoisted(() => ({
  selectProfiles: vi.fn(),
}));

vi.mock("../../../../utils/authentication-factory.js", () => ({
  getM2MProfileSdk: vi.fn(async () => ({ selectProfiles })),
}));

const logger = { info: vi.fn() } as unknown as FastifyBaseLogger;

const check = (userIds: string[]) =>
  ensureShareTargetProfilesExist({
    organizationId: "org-1",
    userIds,
    logger,
  });

describe("ensureShareTargetProfilesExist", () => {
  beforeEach(() => {
    selectProfiles.mockReset();
  });

  it("dedupes ids into one lookup", async () => {
    selectProfiles.mockResolvedValue({ data: [{ id: "a" }, { id: "b" }] });

    await check(["a", "a", "b"]);

    expect(selectProfiles).toHaveBeenCalledTimes(1);
    expect(selectProfiles).toHaveBeenCalledWith("a,b", undefined, false);
  });

  it("chunks lookups above 100 ids", async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `id-${index}`);
    selectProfiles.mockImplementation(async (chunk: string) => ({
      data: chunk.split(",").map((id) => ({ id })),
    }));

    await check(ids);

    expect(selectProfiles).toHaveBeenCalledTimes(2);
    expect(selectProfiles.mock.calls[0][0].split(",")).toHaveLength(100);
    expect(selectProfiles.mock.calls[1][0]).toBe("id-100");
    expect(selectProfiles.mock.calls[0][2]).toBe(false);
  });

  it("returns 404 when any id is missing", async () => {
    selectProfiles.mockResolvedValue({ data: [{ id: "a" }] });

    await expect(check(["a", "b"])).rejects.toMatchObject({ statusCode: 404 });
  });

  it("maps a Profile 404 to 404", async () => {
    selectProfiles.mockResolvedValue({ error: { statusCode: 404 } });

    await expect(check(["a"])).rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns 503 when Profile fails", async () => {
    selectProfiles.mockResolvedValue({ error: { statusCode: 500 } });

    await expect(check(["a"])).rejects.toMatchObject({ statusCode: 503 });
  });

  it("returns 503 when the Profile call throws", async () => {
    selectProfiles.mockRejectedValue(new Error("profile down"));

    await expect(check(["a"])).rejects.toMatchObject({ statusCode: 503 });
  });
});
