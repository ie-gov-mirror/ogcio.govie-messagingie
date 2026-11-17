import {
  type Baggage,
  type Context,
  type instrumentNode,
  propagation,
} from "@ogcio/o11y-sdk-node";

type Propagator = NonNullable<
  NonNullable<Parameters<typeof instrumentNode>[0]>["additionalPropagators"]
>[number];

const COUNTRY_KEY = "geo.country";
const HASH_KEY = "geo.hash";

const COUNTRY_PATTERN = /^[A-Za-z]{2}$/;
// Geohash alphabet: digits and lowercase letters except a, i, l, o.
const HASH_PATTERN = /^[0-9b-hjkmnp-z]{4,}$/;
const HASH_LENGTH = 4;

/**
 * Cleans the country and geohash of the Viewer location in baggage so that
 * no span, log or outbound call carries a malformed country or a geohash
 * finer than 4 characters. A city is passed on as received.
 *
 * Runs after the SDK's geo propagator, e.g.
 *   geo.country=ie, geo.hash=GC7X98, geo.city=Dublin
 *   -> geo.country=IE, geo.hash=gc7x, geo.city=Dublin
 * Extract-only: W3C baggage propagation does the injecting.
 */
export class ViewerLocationPropagator implements Propagator {
  extract(ctx: Context): Context {
    const baggage = propagation.getBaggage(ctx);
    if (!baggage) {
      return ctx;
    }

    return propagation.setBaggage(ctx, clean(baggage));
  }

  inject(): void {}

  fields(): string[] {
    return [];
  }
}

function clean(baggage: Baggage): Baggage {
  let cleaned = replace(baggage, COUNTRY_KEY, cleanCountry);
  cleaned = replace(cleaned, HASH_KEY, cleanHash);

  return cleaned;
}

// Applies a cleaner to one entry, keeping its metadata; drops it on undefined.
function replace(
  baggage: Baggage,
  key: string,
  cleaner: (value: string) => string | undefined,
): Baggage {
  const entry = baggage.getEntry(key);
  if (!entry) {
    return baggage;
  }

  const value = cleaner(entry.value);
  if (value === undefined) {
    return baggage.removeEntry(key);
  }

  return baggage.setEntry(key, { ...entry, value });
}

// "ie" -> "IE"; "ZZ, IE" -> dropped.
function cleanCountry(value: string): string | undefined {
  if (!COUNTRY_PATTERN.test(value)) {
    return undefined;
  }

  return value.toUpperCase();
}

// "GC7X98" -> "gc7x" (coarser enclosing cell); "gc7" or "gc7a" -> dropped.
function cleanHash(value: string): string | undefined {
  const lowered = value.toLowerCase();
  if (!HASH_PATTERN.test(lowered)) {
    return undefined;
  }

  return lowered.slice(0, HASH_LENGTH);
}
