/**
 * The record that feedback was answered.
 *
 * Every comment the orchestrator posts on a workflow pull request embeds an
 * invisible marker naming the newest human review it had read when it acted.
 * The watermark is the newest review so recorded: a review newer than it was
 * never read by any turn, even when it is older than the comment itself (it was
 * submitted while a turn ran). The recorded value is the host's own review
 * timestamp, so the orchestrator's clock is never compared with the host's.
 */

const MARKER = /<!--\s*openspec-answered:\s*(\S+?)\s*-->/;
const NONE = 'none';

/** The parts of a comment the watermark needs. */
export interface WatermarkSource {
  body: string;
  at: string;
}

/** The invisible marker recording the newest human review read, or that none was. */
export function answeredMarker(reviewAt: string | null): string {
  return `<!-- openspec-answered: ${reviewAt ?? NONE} -->`;
}

/**
 * Parse the answered marker from a comment body: the recorded review timestamp,
 * `null` when the marker records that no review was read, or `undefined` when
 * the comment carries no (valid) marker.
 */
export function parseAnsweredMarker(body: string): string | null | undefined {
  const match = MARKER.exec(body);
  if (match === null || match[1] === undefined) return undefined;
  if (match[1] === NONE) return null;
  return Number.isNaN(Date.parse(match[1])) ? undefined : match[1];
}

/**
 * The watermark across the orchestrator's own comments: the newest recorded
 * review. A comment without a marker (posted before markers existed) counts
 * with its own timestamp, so workflows already in flight keep their watermark.
 */
export function answeredWatermark(comments: ReadonlyArray<WatermarkSource>): string | null {
  let latest: string | null = null;
  for (const comment of comments) {
    const recorded = parseAnsweredMarker(comment.body);
    const at = recorded === undefined ? comment.at : recorded;
    if (at === null) continue;
    if (latest === null || Date.parse(at) > Date.parse(latest)) latest = at;
  }
  return latest;
}
