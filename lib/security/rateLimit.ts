type Bucket = {
  tokens: number;
  capacity: number;
  refillPerSec: number;
  lastRefillMs: number;
};

type AllowResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

const ipBuckets = new Map<string, Bucket>();
const meetingBuckets = new Map<string, Bucket>();

function nowMs(): number {
  return Date.now();
}

function refill(bucket: Bucket, currentMs: number): void {
  if (currentMs <= bucket.lastRefillMs) {
    return;
  }
  const elapsedSec = (currentMs - bucket.lastRefillMs) / 1000;
  const refillAmount = elapsedSec * bucket.refillPerSec;
  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + refillAmount);
  bucket.lastRefillMs = currentMs;
}

function ensureBucket(
  store: Map<string, Bucket>,
  key: string,
  capacity: number,
  refillPerSec: number,
  currentMs: number
): Bucket {
  const existing = store.get(key);
  if (existing) {
    return existing;
  }
  const created: Bucket = {
    tokens: capacity,
    capacity,
    refillPerSec,
    lastRefillMs: currentMs
  };
  store.set(key, created);
  return created;
}

function consume(store: Map<string, Bucket>, key: string, capacity: number, refillPerSec: number, cost = 1): AllowResult {
  const currentMs = nowMs();
  const bucket = ensureBucket(store, key, capacity, refillPerSec, currentMs);
  refill(bucket, currentMs);

  if (bucket.tokens >= cost) {
    bucket.tokens -= cost;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const deficit = cost - bucket.tokens;
  const retryAfterSeconds = Math.max(1, Math.ceil(deficit / bucket.refillPerSec));
  return { allowed: false, retryAfterSeconds };
}

export function checkIpJoinRateLimit(ipPrefix: string): AllowResult {
  // 10 joins/minute => capacity 10, refill 10/60 sec
  return consume(ipBuckets, ipPrefix, 10, 10 / 60);
}

export function checkMeetingJoinRateLimit(meetingCode: string): AllowResult {
  // 5 joins/second
  return consume(meetingBuckets, meetingCode, 5, 5);
}
