import type { Actor } from '../domain/types.js';
import type { ProviderReview } from './types.js';

/** Whether an actor is a bot by flag or by the GitHub `[bot]` suffix. */
export function isBotActor(actor: Actor): boolean {
  return actor.isBot || actor.login.endsWith('[bot]');
}

/**
 * The newest review authored by a human. Bot reviews, and reviews by a known
 * bot login, are excluded.
 */
export function latestHumanReview(reviews: ProviderReview[], botLogin?: string): ProviderReview | null {
  const humans = reviews.filter(
    (review) => !isBotActor(review.author) && review.author.login !== botLogin,
  );
  if (humans.length === 0) return null;
  return humans.reduce((latest, review) =>
    Date.parse(review.at) >= Date.parse(latest.at) ? review : latest,
  );
}
