const FALLBACK_FILENAME = "download";

const isControlCharacter = (codePoint: number) =>
  codePoint < 0x20 || codePoint === 0x7f;

const stripControlCharacters = (value: string) =>
  Array.from(value)
    .filter((char) => !isControlCharacter(char.codePointAt(0) ?? 0))
    .join("");

// Percent-encode everything outside the RFC 5987 attr-char set;
// encodeURIComponent leaves ' ( ) * unescaped, which attr-char forbids.
const encodeRfc5987 = (value: string) =>
  encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

const toAsciiFallback = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[^\x20-\x7e]/g, "_");

/**
 * Builds an RFC 6266 Content-Disposition filename while preserving the
 * existing inline response behaviour. The quoted `filename` parameter is
 * restricted to printable ASCII with quotes and backslashes escaped, so a
 * stored filename can never alter response headers; non-ASCII names are
 * preserved via the RFC 5987 `filename*` parameter.
 */
const buildContentDisposition = (filename: string | undefined): string => {
  const sanitized = stripControlCharacters(filename ?? "").trim();
  const name = sanitized === "" ? FALLBACK_FILENAME : sanitized;

  const header = `filename="${toAsciiFallback(name)}"`;

  if (/^[\x20-\x7e]*$/.test(name)) {
    return header;
  }

  return `${header}; filename*=UTF-8''${encodeRfc5987(name)}`;
};

export default buildContentDisposition;
