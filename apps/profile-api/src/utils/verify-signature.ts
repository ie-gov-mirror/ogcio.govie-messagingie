import { createHmac, timingSafeEqual } from "node:crypto";

// https://docs.logto.io/docs/recipes/webhooks/securing-your-webhooks/
const verifySignature = (
  signingKey: string,
  rawBody: Buffer,
  expectedSignature: string,
) => {
  if (typeof expectedSignature !== "string") {
    return false;
  }
  const hmac = createHmac("sha256", signingKey);
  hmac.update(rawBody);
  const signature = Buffer.from(hmac.digest("hex"));
  const expected = Buffer.from(expectedSignature);
  return (
    signature.length === expected.length && timingSafeEqual(signature, expected)
  );
};

export { verifySignature };
