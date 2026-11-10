import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { build } from "./test-server-builder.js";

describe("openapi-definition.yml", () => {
  it("matches the spec the API emits", async () => {
    const app = await build();
    await app.ready();
    const committed = await readFile(
      join(import.meta.dirname, "../../openapi-definition.yml"),
      "utf8",
    );
    // Document equality. yaml reflows long plain scalars when line-width
    // accounting changes, which a dependency bump on main already did to the
    // committed files. The contract is the document.
    expect(parse(app.swagger({ yaml: true }))).toEqual(parse(committed));
  });
});
