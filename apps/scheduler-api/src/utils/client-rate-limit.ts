type Bucket = { count: number; resetAt: number };

export function createClientRateLimiter(max: number, windowMs: number) {
  const buckets = new Map<string, Bucket>();

  return (key: string, now = Date.now()) => {
    const current = buckets.get(key);
    if (!current || now >= current.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (current.count >= max) {
      return false;
    }
    current.count += 1;
    return true;
  };
}
