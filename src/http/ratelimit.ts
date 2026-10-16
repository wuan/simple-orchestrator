/** Raised when the host rate limit is (or is about to be) exhausted. */
export class RateLimitError extends Error {
  readonly resetAt: Date | null;

  constructor(message: string, resetAt: Date | null) {
    super(message);
    this.name = 'RateLimitError';
    this.resetAt = resetAt;
  }
}

function headerNumber(headers: Record<string, string>, name: string): number | null {
  const raw = headers[name];
  if (raw === undefined) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** Whether the remaining quota is below the configured floor. */
export function shouldBackOff(headers: Record<string, string>, floor: number): boolean {
  const remaining = headerNumber(headers, 'x-ratelimit-remaining');
  return remaining !== null && remaining < floor;
}

/** The moment the quota resets, from `x-ratelimit-reset` (epoch seconds). */
export function resetTimeFromHeaders(headers: Record<string, string>): Date | null {
  const seconds = headerNumber(headers, 'x-ratelimit-reset');
  if (seconds === null) return null;
  return new Date(seconds * 1000);
}

/**
 * Tracks the host rate-limit budget across calls. Once the remaining quota
 * drops below the floor, the tracker backs off until the documented reset.
 */
export class RateLimitTracker {
  private backoffUntil: Date | null = null;

  constructor(private readonly floor: number) {}

  observe(headers: Record<string, string>): void {
    if (shouldBackOff(headers, this.floor)) {
      this.backoffUntil = resetTimeFromHeaders(headers) ?? new Date(Date.now() + 60_000);
    }
  }

  get until(): Date | null {
    return this.backoffUntil;
  }

  isBackingOff(now: Date = new Date()): boolean {
    return this.backoffUntil !== null && this.backoffUntil.getTime() > now.getTime();
  }

  /** Throws when a call is attempted while backing off. */
  assertAllowed(now: Date = new Date()): void {
    if (this.isBackingOff(now)) {
      throw new RateLimitError(
        `rate limit quota is low; backing off until ${this.backoffUntil?.toISOString() ?? 'unknown'}`,
        this.backoffUntil,
      );
    }
  }

  clear(): void {
    this.backoffUntil = null;
  }
}
