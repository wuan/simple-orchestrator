# Design

## Context

See `proposal.md` - Why. The behavior that shapes the fix:

- `WorkflowEngine.drive` builds the watermark from
  `lastBotCommentAt(comments)`, which keeps comments whose author has
  `isBot === true`, and counts revise rounds with the same filter
  (`botTurns - 1`). It then calls `decide`, which treats a review as fresh when
  `review.at` is strictly newer than the watermark (or the watermark is empty).
- `latestHumanReview(reviews, botLogin)` already excludes reviews by the host's
  bot flag **and** by the configured bot login.
- The GitHub provider maps `isBot` from `user.type === 'Bot'` or a `[bot]`
  login. The project's credential (`wuan-bot`) is a normal user account, so the
  host does not flag it and only the configured login identifies it.
- `decide` is pure and stays unchanged; the defect is entirely in how the engine
  classifies the comments it reads.

## Goals / Non-Goals

**Goals:**

- A review the orchestrator has already answered SHALL NOT drive another turn,
  on every later poll and across a restart.
- The revise limit SHALL count the orchestrator's own turns even when the host
  does not flag the bot account.
- Keep the durable record host-native: the turn comment the orchestrator already
  posts.

**Non-Goals:**

- Treating plain conversation comments as turn triggers; only submitted reviews
  drive turns.
- Recording an explicit answered-review identifier (a label or an HTML marker on
  the comment).
- Changing how reviews are listed or how the decision itself compares times.

## Decisions

### Recognise the orchestrator's own authors by identity, not only by host flag

Add one shared predicate (for example `isOrchestratorActor(author, botLogin)`)
next to `isBotActor` in `src/provider/reviews.ts` that is true when the host
flags the author as a bot or the author's login equals the configured bot login,
and reuse it for both reviews and comments. `latestHumanReview` already excludes
the configured login; the fix makes the engine's comment classification agree
with it.

- Alternative: require operators to use a `[bot]` account. Rejected: the
  project's credential is a normal user, and the provider already exposes
  `botIdentity()`, so the identity is available without an operational change.
- Alternative: flag every comment by the authenticated user as the orchestrator's
  regardless of login. Rejected: a human who shares the account would be hidden;
  matching the configured login is precise.

### The last orchestrator comment is the answered-feedback record

Every terminal path already posts a comment under the orchestrator's identity
(the turn comment, the readiness prompt, the failure comment, the lifecycle
comments), and its timestamp comes from the host. `decide` compares the newest
human review against `lastTurnAt`. Repairing the classification therefore makes
the existing watermark the durable answered-feedback record - no new state.

- Alternative: a label or comment marker naming the answered review id.
  Rejected: it adds a second source of truth that can drift from the timestamp
  watermark, and the timestamp already answers "was this review answered?" -
  the only defect was misclassifying the orchestrator's comments.
- Alternative: track answered reviews in memory. Rejected: it resets on restart,
  which is exactly when a stale review would otherwise be re-answered.

### Thread the resolved bot login into the decision helpers

`drive` already awaits `getBotLogin()` for `latestHumanReview`; pass the same
value to the watermark and the revise-round count. The engine caches the login
per process, so no extra provider call is added.

## Risks / Trade-offs

- [A review and the orchestrator's comment tie on the same timestamp] -> the
  comparison is strictly newer, so a tie counts as already answered. Acceptable:
  both timestamps originate on the host, and a review submitted before the turn
  ran cannot be answered by it.
- [A turn that fails before posting a comment leaves the watermark unchanged] ->
  the review would drive one more turn after a crash. Acceptable: every normal
  terminal path posts a comment, and re-running after a crash is the existing
  at-least-once behavior.
- [Lifecycle comments also advance the watermark] -> a review that arrives just
  before an unrelated lifecycle comment is treated as answered. Acceptable: in
  practice the lifecycle comment follows a turn that already consumed the
  review.
- [The predicate widens a provider module] -> it is one exported function reused
  by the review filter and the engine, covered by unit tests in both places.
