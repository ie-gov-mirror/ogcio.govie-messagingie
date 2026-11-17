import { getGeoAttributes } from "@ogcio/o11y-sdk-node";

// 4-character geohash, about 40 km: a broad area, never a person
const GEOHASH_PATTERN = /^[0-9b-hjkmnp-z]{4}$/;

// The citizen's geohash from the request's OTel baggage (geo.hash), which the
// journey sets; undefined when absent or malformed, as the caller controls it
export function requestGeohash(): string | undefined {
  const geohash = getGeoAttributes()["geo.hash"];
  if (!geohash || !GEOHASH_PATTERN.test(geohash)) {
    return undefined;
  }

  return geohash;
}
