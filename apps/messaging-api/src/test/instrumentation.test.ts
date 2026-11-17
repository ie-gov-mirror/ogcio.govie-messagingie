import { afterEach, describe, expect, it, vi } from "vitest";

const instrumentNode = vi.fn().mockResolvedValue(undefined);

vi.mock("@ogcio/o11y-sdk-node", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@ogcio/o11y-sdk-node")>();

  return {
    ...original,
    instrumentNode: (...args: unknown[]) => instrumentNode(...args),
  };
});

describe("Instrumentation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    instrumentNode.mockClear();
  });

  // The public API passes the Viewer location on in baggage; reading it here
  // needs geo enrichment, cleaned by the same propagator
  it("enables geo enrichment with the viewer location propagator", async () => {
    vi.stubEnv("OTEL_COLLECTOR_URL", "http://localhost:4317");
    vi.resetModules();
    const { ViewerLocationPropagator } = await import(
      "../utils/viewer-location-propagator.js"
    );

    await import("../instrumentation.js");

    expect(instrumentNode).toHaveBeenCalledWith(
      expect.objectContaining({
        geoEnrichment: { enabled: true },
        additionalPropagators: [expect.any(ViewerLocationPropagator)],
      }),
    );
  });
});
