import type { TurnUsage } from '../domain/types.js';

/**
 * Rendering and recovery of the usage line carried on every comment.
 *
 * A turn's own comment embeds the usage as an invisible, machine-readable HTML
 * comment (a marker). A later comment for a transition with no turn behind it
 * repeats the most recent marker it can find, so the engine stays stateless and
 * a restart still reports the last turn's cost.
 */

/** The fields that contribute to a token total and are summed as usage streams. */
const NUMERIC_KEYS = [
  'input',
  'output',
  'reasoning',
  'cacheRead',
  'cacheWrite',
  'tokens',
  'steps',
] as const;

const MARKER = /<!--\s*openspec-usage:\s*([\s\S]*?)\s*-->/;

/** The parts of a comment the usage recovery needs. */
export interface MetricSource {
  body: string;
  at: string;
}

/** Sum usage a runtime streams through `onUsage` into an accumulator. */
export function accumulateUsage(target: TurnUsage, partial: Partial<TurnUsage>): void {
  if (partial.model !== undefined) target.model = partial.model;
  for (const key of NUMERIC_KEYS) {
    const value = partial[key];
    if (value === undefined) continue;
    target[key] = (target[key] ?? 0) + value;
  }
}

/**
 * Combine the usage a runtime streamed with the usage it returned, filling any
 * field the stream left unknown. The streamed usage wins where both are known:
 * it spans every attempt of a retried turn, whereas a returned result only
 * describes the attempt that succeeded.
 */
export function mergeUsage(base: TurnUsage, returned: TurnUsage | undefined): TurnUsage {
  if (returned === undefined) return base;
  const merged: TurnUsage = { ...base };
  if (merged.model === undefined && returned.model !== undefined) merged.model = returned.model;
  for (const key of NUMERIC_KEYS) {
    if (merged[key] === undefined && returned[key] !== undefined) merged[key] = returned[key];
  }
  return merged;
}

/** The total tokens, from the reported total or by summing the buckets. */
function totalTokens(usage: TurnUsage | undefined): number | undefined {
  if (usage === undefined) return undefined;
  if (usage.tokens !== undefined) return usage.tokens;
  const buckets = [
    usage.input,
    usage.output,
    usage.reasoning,
    usage.cacheRead,
    usage.cacheWrite,
  ].filter((value): value is number => value !== undefined);
  if (buckets.length === 0) return undefined;
  return buckets.reduce((sum, value) => sum + value, 0);
}

/** Render a wall-clock duration compactly: milliseconds under a second, else seconds. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

function modelText(usage: TurnUsage | undefined): string {
  return usage?.model === undefined || usage.model === '' ? 'unknown' : `\`${usage.model}\``;
}

function tokensText(usage: TurnUsage | undefined): string {
  const total = totalTokens(usage);
  if (total === undefined) return 'tokens unknown';
  const buckets: ReadonlyArray<readonly [string, number | undefined]> = [
    ['input', usage?.input],
    ['output', usage?.output],
    ['reasoning', usage?.reasoning],
    ['cache read', usage?.cacheRead],
    ['cache write', usage?.cacheWrite],
  ];
  if (buckets.every(([, value]) => value === undefined)) return `tokens ${total}`;
  const detail = buckets.map(([label, value]) => `${label} ${value ?? 'unknown'}`).join(' · ');
  return `tokens ${total} (${detail})`;
}

/**
 * Render one metrics line. `lastTurn` labels the line as the last turn's, which
 * a lifecycle comment without a turn behind it uses.
 */
export function usageLine(usage: TurnUsage | undefined, lastTurn = false): string {
  const label = lastTurn ? '**Usage (last turn):**' : '**Usage:**';
  const elapsed = usage?.durationMs === undefined ? 'unknown' : formatDuration(usage.durationMs);
  const attempts = usage?.attempts === undefined ? 'unknown' : String(usage.attempts);
  return `${label} model ${modelText(usage)} · ${tokensText(usage)} · elapsed ${elapsed} · attempts ${attempts}`;
}

/** The invisible marker carrying a turn's usage as JSON. */
export function usageMarker(usage: TurnUsage): string {
  return `<!-- openspec-usage: ${JSON.stringify(usage)} -->`;
}

/** Parse the usage marker from a comment body, if it carries one. */
export function parseUsageMarker(body: string): TurnUsage | undefined {
  const match = MARKER.exec(body);
  if (match === null || match[1] === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  return parsed as TurnUsage;
}

/** The most recent usage marker among comments, by timestamp. */
export function latestUsage(comments: ReadonlyArray<MetricSource>): TurnUsage | undefined {
  let latest: TurnUsage | undefined;
  let latestAt = Number.NEGATIVE_INFINITY;
  for (const comment of comments) {
    const usage = parseUsageMarker(comment.body);
    if (usage === undefined) continue;
    const at = Date.parse(comment.at);
    const stamp = Number.isNaN(at) ? 0 : at;
    if (latest === undefined || stamp >= latestAt) {
      latest = usage;
      latestAt = stamp;
    }
  }
  return latest;
}

/** Append a turn's own metrics line and marker to a comment body. */
export function withTurnMetrics(body: string, usage: TurnUsage): string {
  return `${body}\n\n${usageLine(usage)}\n${usageMarker(usage)}`;
}

/**
 * Append a lifecycle comment's metrics line, repeating the last turn's usage and
 * labelling it as such; an absent usage renders as unknown, never omitted.
 */
export function withLastTurnMetrics(body: string, usage: TurnUsage | undefined): string {
  return `${body}\n\n${usageLine(usage, true)}`;
}
