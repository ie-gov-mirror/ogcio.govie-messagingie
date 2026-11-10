import { createCipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { EnvEmailConfig } from "../../plugins/external/env.js";
import CryptographyService from "../../utils/cryptography-service.js";

describe("cryptography service", () => {
  const getMockEnvConfig = (): EnvEmailConfig => ({
    EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    EMAIL_PROVIDER_SMTP_HOST: "host",
    EMAIL_PROVIDER_SMTP_PORT: 587,
    EMAIL_PROVIDER_SMTP_USERNAME: "user",
    EMAIL_PROVIDER_SMTP_PASSWORD: "password",
    EMAIL_PROVIDER_SMTP_FROM_ADDRESS: "from@example.com",
    EMAIL_PROVIDER_SMTP_USE_SSL: true,
    WEBHOOK_URL_BASE: "http://example.com",
    EMAIL_PROVIDER_SMTP_TENANT_NAME: undefined,
  });

  it("should throw error if encryption key is empty", () => {
    const envConfig = getMockEnvConfig();
    envConfig.EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY = "";

    expect(() => new CryptographyService(envConfig)).toThrow();
  });

  it("should throw error if encryption key is not 32 chars long", () => {
    const envConfig = getMockEnvConfig();
    envConfig.EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY =
      randomBytes(16).toString("base64");

    expect(() => new CryptographyService(envConfig)).toThrow();
  });

  it("encrypt and decrypt returns the original text", () => {
    const envConfig = getMockEnvConfig();
    const cryptoService = new CryptographyService(envConfig);
    const text = "some text to encrypt";

    const encryptedText = cryptoService.encrypt(text);
    const decryptedText = cryptoService.decrypt(encryptedText);

    expect(decryptedText).toBe(text);
  });

  it("encrypts with AES-256-GCM", () => {
    const cryptoService = new CryptographyService(getMockEnvConfig());

    expect(cryptoService.encrypt("secret")).toMatch(/^gcm:[0-9a-f]+$/);
  });

  it("rejects a tampered ciphertext", () => {
    const cryptoService = new CryptographyService(getMockEnvConfig());
    const encrypted = cryptoService.encrypt("some text to encrypt");
    // Index 33 changes CBC plaintext, not padding, so only an authentication tag catches it.
    const flipped = encrypted[33] === "0" ? "1" : "0";
    const tampered = `${encrypted.slice(0, 33)}${flipped}${encrypted.slice(34)}`;

    expect(() => cryptoService.decrypt(tampered)).toThrow();
  });

  it("still decrypts a legacy AES-256-CBC value", () => {
    const envConfig = getMockEnvConfig();
    const key = Buffer.from(
      envConfig.EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY,
      "base64",
    );
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-cbc", key, iv);
    const legacy =
      iv.toString("hex") +
      cipher.update("legacy secret", "utf8", "hex") +
      cipher.final("hex");

    expect(new CryptographyService(envConfig).decrypt(legacy)).toBe(
      "legacy secret",
    );
  });
});
