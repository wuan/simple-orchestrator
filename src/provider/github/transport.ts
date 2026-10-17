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

/** The shape GitHub returns for a GraphQL request. */
export interface GraphqlEnvelope<T> {
  data?: T;
  errors?: { message?: string }[];
}

/**
 * Unwrap a GraphQL response body. GitHub answers `200 OK` even when a mutation
 * fails, reporting the failure in `errors`; surfacing those as a
 * `GitHubApiError` keeps a failed mutation from looking like success.
 */
export function unwrapGraphql<T>(text: string, status: number): T {
  const envelope = text.trim() === '' ? null : (JSON.parse(text) as GraphqlEnvelope<T>);
  if (envelope !== null && Array.isArray(envelope.errors) && envelope.errors.length > 0) {
    const message = envelope.errors.map((error) => error.message ?? 'unknown error').join('; ');
    throw new GitHubApiError(`GraphQL request failed: ${message}`, status);
  }
  if (envelope === null || envelope.data === undefined) {
    throw new GitHubApiError('GraphQL response contained no data', status);
  }
  return envelope.data;
}

/** Host operations the provider needs, independent of how they are executed. */
export interface GitHubTransport {
  json<T>(method: string, path: string, options?: JsonOptions): Promise<JsonResult<T>>;
  /** GET every page of a paginated endpoint. */
  paginate<T>(path: string, query?: Record<string, QueryValue>): Promise<T[]>;
  /**
   * Run a GraphQL query or mutation and return its `data`. GitHub exposes some
   * pull request transitions only through GraphQL, so the provider needs this
   * alongside the REST operations.
   */
  graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
}
