# Proposal

## Why

The orchestrator answers the newest human review by running a turn and posting a
turn comment, then uses that comment's timestamp as the watermark: a submitted
review drives a turn only when it is newer than the last turn. But it recognises
its own comments only through the host's bot flag (`user.type === 'Bot'` or a
`[bot]` login), while it already recognises its own reviews by the configured
bot login as well. A deployment whose credential is a normal user account - the
common case, and the one running this project (`wuan-bot`) - therefore never
recognises the comments it posts. The watermark stays empty, every poll sees the
same review as new, and the orchestrator answers the same feedback again and
again with no further human input (issue #37, observed on PR #36). The
revise-round count shares the blind spot, so the revise limit never fires either
and the loop is unbounded.

## What Changes

- The orchestrator SHALL identify the comments it authored by its configured
  identity (the provider's bot login) as well as by the host's bot flag, exactly
  as it already identifies its own reviews.
- Its most recent such comment is the durable record that the newest feedback
  was answered; only a review newer than it SHALL drive a turn.
- The revise-round count SHALL be derived the same way, so the revise limit
  applies to a bot the host does not flag.
- No new labels, configuration, or durable state: the turn comment the
  orchestrator already posts is the record, and it survives restarts.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-orchestration`: a submitted review drives a turn only when it is
  newer than the orchestrator's own most recent comment, where the orchestrator's
  own activity is identified by its configured identity and not only by the
  host's bot flag, so feedback it has already answered no longer drives another
  turn.

## Impact

- `src/provider/reviews.ts` - one shared "is this the orchestrator's author"
  predicate, reused for reviews and comments.
- `src/orchestrator/engine.ts` - the timestamp watermark and the revise-round
  count classify comments with that predicate.
- `src/provider/reviews.test.ts`, `src/orchestrator/engine.test.ts` - coverage
  for a configured bot login the host does not flag.
- No behavior change for a host-flagged bot and no configuration or label change.
