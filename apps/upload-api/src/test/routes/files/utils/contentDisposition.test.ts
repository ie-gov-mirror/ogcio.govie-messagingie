import { describe, expect, it } from "vitest";
import buildContentDisposition from "../../../../routes/files/utils/contentDisposition.js";

describe("buildContentDisposition", () => {
  it("preserves inline behaviour for a plain ascii filename", () => {
    expect(buildContentDisposition("report.pdf")).toBe('filename="report.pdf"');
  });

  it("escapes quotes and backslashes in the quoted filename", () => {
    expect(buildContentDisposition('he said "hi".pdf')).toBe(
      'filename="he said \\"hi\\".pdf"',
    );
    expect(buildContentDisposition("a\\b.pdf")).toBe('filename="a\\\\b.pdf"');
  });

  it("strips control characters so headers cannot be altered", () => {
    const header = buildContentDisposition(
      'evil\r\nContent-Type: text/html\r\n\r\n<script>alert("x")</script>.txt',
    );

    expect(header).not.toMatch(/[\r\n\0]/);
    expect(header.startsWith('filename="')).toBe(true);
  });

  it("preserves non-ascii names via an RFC 5987 filename* parameter", () => {
    expect(buildContentDisposition("résumé.pdf")).toBe(
      "filename=\"r_sum_.pdf\"; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf",
    );
  });

  it("percent-encodes characters outside the RFC 5987 attr-char set", () => {
    expect(buildContentDisposition("naïve (1)'*.txt")).toBe(
      "filename=\"na_ve (1)'*.txt\"; filename*=UTF-8''na%C3%AFve%20%281%29%27%2A.txt",
    );
  });

  it("falls back to a default name when the filename is missing or empty", () => {
    expect(buildContentDisposition(undefined)).toBe('filename="download"');
    expect(buildContentDisposition("")).toBe('filename="download"');
    expect(buildContentDisposition("\r\n")).toBe('filename="download"');
  });
});
