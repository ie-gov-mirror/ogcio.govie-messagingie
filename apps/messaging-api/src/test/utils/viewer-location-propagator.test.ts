import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  type Context,
  GeoBaggagePropagator,
  propagation,
} from "@ogcio/o11y-sdk-node";
import { describe, expect, it } from "vitest";
import { ViewerLocationPropagator } from "../../utils/viewer-location-propagator.js";

// The OTel packages are transitive deps of the SDK: load the SDK's own copies.
const sdkRequire = createRequire(
  realpathSync(fileURLToPath(import.meta.resolve("@ogcio/o11y-sdk-node"))),
);
const { CompositePropagator, W3CBaggagePropagator } = sdkRequire(
  "@opentelemetry/core",
);
const { ROOT_CONTEXT, defaultTextMapGetter, defaultTextMapSetter } =
  sdkRequire("@opentelemetry/api");

type Headers = Record<string, string>;

const CLOUDFRONT_HEADERS: Headers = {
  "cloudfront-viewer-country": "IE",
  "cloudfront-viewer-latitude": "53.35",
  "cloudfront-viewer-longitude": "-6.26",
};
const DUBLIN_HASH = "gc7x";

// Same order as the SDK with geo enrichment enabled.
const chain = new CompositePropagator({
  propagators: [
    new W3CBaggagePropagator(),
    new GeoBaggagePropagator(),
    new ViewerLocationPropagator(),
  ],
});

function extract(headers: Headers): Context {
  return chain.extract(ROOT_CONTEXT, headers, defaultTextMapGetter);
}

function entries(ctx: Context): Record<string, string> {
  const baggage = propagation.getBaggage(ctx);
  if (!baggage) {
    return {};
  }

  return Object.fromEntries(
    baggage.getAllEntries().map(([key, entry]) => [key, entry.value]),
  );
}

function injected(ctx: Context): string | undefined {
  const carrier: Headers = {};
  chain.inject(ctx, carrier, defaultTextMapSetter);

  return carrier.baggage;
}

describe("ViewerLocationPropagator", () => {
  it("derives country and 4-char hash from CloudFront headers", () => {
    const ctx = extract(CLOUDFRONT_HEADERS);

    expect(entries(ctx)).toEqual({
      "geo.country": "IE",
      "geo.hash": DUBLIN_HASH,
    });
    expect(injected(ctx)).toBe(`geo.country=IE,geo.hash=${DUBLIN_HASH}`);
  });

  it("keeps the caller's geo baggage over CloudFront headers", () => {
    const ctx = extract({
      ...CLOUDFRONT_HEADERS,
      baggage: "geo.country=FR,geo.hash=u09t",
    });

    expect(entries(ctx)).toEqual({ "geo.country": "FR", "geo.hash": "u09t" });
  });

  it("cuts a 6-char caller hash to 4", () => {
    const ctx = extract({ baggage: "geo.hash=gc7x98" });

    expect(entries(ctx)).toEqual({ "geo.hash": "gc7x" });
    expect(injected(ctx)).toBe("geo.hash=gc7x");
  });

  it("lowercases an uppercase caller hash", () => {
    const ctx = extract({ baggage: "geo.hash=GC7X98" });

    expect(entries(ctx)).toEqual({ "geo.hash": DUBLIN_HASH });
  });

  it.each([
    ["too short", "gc7"],
    ["outside the alphabet", "gc7a"],
    ["outside the alphabet once lowercased", "GC7A"],
  ])("drops a caller hash that is %s", (_name, hash) => {
    const ctx = extract({ baggage: `geo.hash=${hash},geo.country=IE` });

    expect(entries(ctx)).toEqual({ "geo.country": "IE" });
  });

  it.each([
    ["a merged value", "ZZ, IE"],
    ["an oversized string", "I".repeat(1000)],
    ["one letter", "I"],
    ["non-letters", "I1"],
  ])("drops a country that is %s", (_name, country) => {
    const ctx = extract({
      ...CLOUDFRONT_HEADERS,
      "cloudfront-viewer-country": country,
    });

    expect(entries(ctx)).toEqual({ "geo.hash": DUBLIN_HASH });
  });

  it("uppercases a lowercase country", () => {
    const ctx = extract({ baggage: "geo.country=ie" });

    expect(entries(ctx)).toEqual({ "geo.country": "IE" });
  });

  it("keeps a city from baggage", () => {
    const ctx = extract({ baggage: "geo.country=IE,geo.city=Dublin" });

    expect(entries(ctx)).toEqual({ "geo.country": "IE", "geo.city": "Dublin" });
    expect(injected(ctx)).toContain("geo.city=Dublin");
  });

  it("leaves non-geo baggage entries unchanged", () => {
    const ctx = extract({ baggage: "tenant=abc,geo.country=ie" });

    expect(entries(ctx)).toEqual({ tenant: "abc", "geo.country": "IE" });
  });

  it("does nothing without headers and baggage", () => {
    const ctx = extract({});

    expect(entries(ctx)).toEqual({});
    expect(injected(ctx)).toBeUndefined();
  });
});
