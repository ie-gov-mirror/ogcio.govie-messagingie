import { describe, expect, it } from "vitest";
import {
  ALLOWED_EXTENSIONS,
  EXTENSION_MIME_TYPES,
  getResponseMimeType,
} from "../../../../routes/files/utils/fileTypes.js";

describe("getResponseMimeType", () => {
  it("maps allowed extensions to their canonical mime type", () => {
    expect(getResponseMimeType("report.pdf")).toBe("application/pdf");
    expect(getResponseMimeType("image.svg")).toBe("application/octet-stream");
    expect(getResponseMimeType("notes.txt")).toBe("text/plain");
  });

  it("is case-insensitive on the extension", () => {
    expect(getResponseMimeType("IMAGE.SVG")).toBe("application/octet-stream");
    expect(getResponseMimeType("Report.PDF")).toBe("application/pdf");
  });

  it("falls back to application/octet-stream for unknown or missing extensions", () => {
    expect(getResponseMimeType("page.html")).toBe("application/octet-stream");
    expect(getResponseMimeType("no-extension")).toBe(
      "application/octet-stream",
    );
    expect(getResponseMimeType(undefined)).toBe("application/octet-stream");
  });

  it("keeps the upload allowlist in sync with the mime map", () => {
    expect(ALLOWED_EXTENSIONS).toEqual(Object.keys(EXTENSION_MIME_TYPES));
    for (const extension of ALLOWED_EXTENSIONS) {
      expect(getResponseMimeType(`file${extension}`)).toBe(
        EXTENSION_MIME_TYPES[extension],
      );
    }
  });
});
