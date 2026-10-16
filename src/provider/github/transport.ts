/**
 * The seam between the GitHub provider and the transport that actually talks
 * to GitHub. Two transports exist: `GitHubRest` (direct REST over HTTPS) and
 * `GhCliTransport` (the `gh` CLI). The provider is written against this
 * interface so the host calls do not change when the transport does.
 */

/** Raised for a failed GitHub response other than a rate-limit condition. */
export class GitHubApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
  }
}

export type QueryValue = string | number | boolean | undefined;

export interface JsonResult<T> {
  status: number;
  data: T | null;
  /** True when a conditional request was answered with 304 Not Modified. */
  notModified: boolean;
}

export interface JsonOptions {
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** When supported, enables conditional requests for this resource. */
  cacheKey?: string;
}

/** Host operations the provider needs, independent of how they are executed. */
export interface GitHubTransport {
  json<T>(method: string, path: string, options?: JsonOptions): Promise<JsonResult<T>>;
  /** GET every page of a paginated endpoint. */
  paginate<T>(path: string, query?: Record<string, QueryValue>): Promise<T[]>;
}
