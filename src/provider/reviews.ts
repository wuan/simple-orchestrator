import type { Actor } from '../domain/types.js';
import type { ProviderReview } from './types.js';

/** Whether an actor is a bot by flag or by the GitHub `[bot]` suffix. */
export function isBotActor(actor: Actor): boolean {
  return actor.isBot || actor.login.endsWith('[bot]');
}

/**
 * Whether an actor is the orchestrator itself: flagged as a bot by the host
 * (`isBot` or the `[bot]` login suffix) or matching the configured bot login.
 * The configured login is what identifies a normal user account the host does
 * not flag, so the orchestrator's own activity is recognised on either signal.
 */
export function isOrchestratorActor(actor: Actor, botLogin?: string): boolean {
  return isBotActor(actor) || (botLogin !== undefined && actor.login === botLogin);
}

/**
 * The newest review authored by a human. The orchestrator's own reviews -
 * flagged as a bot by the host or matching the configured bot login - are
 * excluded.
 */
export function latestHumanReview(
  reviews: ProviderReview[],
  botLogin?: string,
): ProviderReview | null {
  const humans = reviews.filter((review) => !isOrchestratorActor(review.author, botLogin));
  return humans.reduce<ProviderReview | null>(
    (latest, review) =>
      latest === null || Date.parse(review.at) >= Date.parse(latest.at) ? review : latest,
    null,
  );
}
