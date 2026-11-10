import crypto from "node:crypto";

const GCM_PREFIX = "gcm:";
const GCM_IV_HEX_LENGTH = 24;
const GCM_TAG_HEX_LENGTH = 32;

class CryptographyService {
  private encryptionKey: Buffer;

  constructor(config: { EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY: string }) {
    const encryptionKeyBase64 = config.EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY;
    if (!encryptionKeyBase64 || encryptionKeyBase64.length === 0) {
      throw Error("Missing env var EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY");
    }

    this.encryptionKey = Buffer.from(encryptionKeyBase64, "base64");

    if (this.encryptionKey.length !== 32) {
      throw Error(
        "EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY must be 32 bytes when decoded from base64",
      );
    }
  }

  /** Returns `gcm:` + hex(12-byte IV, 16-byte auth tag, ciphertext). */
  encrypt(text: string): string {
    const iv = crypto.randomBytes(GCM_IV_HEX_LENGTH / 2);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const encrypted = cipher.update(text, "utf8", "hex") + cipher.final("hex");

    return (
      GCM_PREFIX +
      iv.toString("hex") +
      cipher.getAuthTag().toString("hex") +
      encrypted
    );
  }

  decrypt(encryptedText: string): string {
    if (!encryptedText.startsWith(GCM_PREFIX)) {
      return this.decryptLegacyCbc(encryptedText);
    }

    const payload = encryptedText.slice(GCM_PREFIX.length);
    const iv = Buffer.from(payload.slice(0, GCM_IV_HEX_LENGTH), "hex");
    const tag = Buffer.from(
      payload.slice(GCM_IV_HEX_LENGTH, GCM_IV_HEX_LENGTH + GCM_TAG_HEX_LENGTH),
      "hex",
    );
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.encryptionKey,
      iv,
      { authTagLength: GCM_TAG_HEX_LENGTH / 2 },
    );
    decipher.setAuthTag(tag);

    return (
      decipher.update(
        payload.slice(GCM_IV_HEX_LENGTH + GCM_TAG_HEX_LENGTH),
        "hex",
        "utf8",
      ) + decipher.final("utf8")
    );
  }

  // Values written before GCM: hex(16-byte IV) + hex(ciphertext), unauthenticated.
  // They are rewritten as GCM the next time the provider is saved.
  private decryptLegacyCbc(encryptedText: string): string {
    const iv = Buffer.from(encryptedText.slice(0, 32), "hex");
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      this.encryptionKey,
      iv,
    );

    return (
      decipher.update(encryptedText.slice(32), "hex", "utf8") +
      decipher.final("utf8")
    );
  }
}

export default CryptographyService;
