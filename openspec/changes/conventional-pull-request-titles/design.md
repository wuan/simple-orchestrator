# Design

## Context

See `proposal.md` - Why. The current state this builds on:

- `WorkflowEngine.start` (`src/orchestrator/engine.ts`) creates the draft pull
  request with `pullRequestTitle(issue)`, which returns the issue title verbatim,
  and a body that carries only the closing reference. The provider
  (`RepoProvider.createDraftPullRequest`) transports the title and, before this
  change, has no operation to edit a pull request afterwards.
- `ProviderIssue` carries the issue `title`, `body`, and `labels`, so `start`
  already has the issue context from which a Conventional Commit subject can be
  deduced before any turn runs.
- The `WorkflowEngine` runs apply turns with `SandboxHandle`
  (`src/runtime/sandbox.ts`), which already reads repository state
  (`head`, `baseIntegrated`, `hasChanges`) to judge a turn from the repository
  rather than from runtime self-report.
- The orchestrator's own turns commit with Conventional Commit messages, so the
  applied commits are an authoritative, machine-readable record of the outcome.
- Repository configuration is a declarative list with optional `defaults`
  merged beneath each entry.

## Goals / Non-Goals

**Goals:**

- The created pull request title is a Conventional Commit subject, so the
  message the host derives from it on merge follows the project convention.
- The `type` and `scope` are deduced from the issue context, not configured, so
  a repository that configures nothing still gets a valid subject and an author
  can override per issue by writing the issue title conventionally.
- The summary is compacted as much as possible from the declarative issue title
  to fit the project's commit-subject limit, without rewriting its words.
- After the apply turn, the title is verified against the applied outcome and
  updated when the outcome makes a different type or scope clear.
- Keep the change testable and host-agnostic: deduction and compaction are pure
  functions, the outcome is read from the repository, and the title is updated
  through the provider contract.

**Non-Goals:**

- Inferring the type from issue labels alone when an even clearer signal (a
  conventional issue title, or the applied commits) is available. The issue
  labels are one input to deduction, not the only one.
- Rewriting the issue title into an imperative sentence or otherwise rewriting
  its meaning. The summary keeps the author's words; only structure and length
  are changed.
- Backfilling or editing pull requests created before this change.
- Adding a configuration surface for the type or scope. The review asked for
  deduction from the issue context instead of a configured default.

## Decisions

### Deduce the type and scope from the issue context, not from configuration

The first revision of this change proposed an optional `pullRequest`
configuration block with a default `type` and optional `scope`. The review
rejected that: the type should be deduced from the issue context, and a scope
should be added when it is clear from the task and the outcome. This revision
removes the configuration block.

Deduction order for the created title:

1. **A conventional issue title wins.** If the issue title already begins with a
   recognized Conventional Commit prefix (`<type>: ` or `<type>(<scope>): `),
   that type and scope are authoritative and the prefix is kept. This is the
   per-issue override for `fix`, `docs`, or a scope, and it needs no
   configuration. A prefix is recognized only when its type is one of the
   project's Conventional Commit types (`feat`, `fix`, `docs`, `test`,
   `refactor`, `perf`, `build`, `ci`, `chore`, per `AGENTS.md`); any other word
   before the colon is not a Conventional Commit prefix and falls through to the
   label rule. Reconciliation reads the applied subjects with the same set.
2. **Otherwise the type is deduced from the issue's labels** through a
   documented table (`bug` -> `fix`; `documentation`/`docs` -> `docs`;
   `enhancement`/`feature` -> `feat`; `refactor` -> `refactor`;
   `performance`/`perf` -> `perf`; `test`/`tests` -> `test`; `ci` -> `ci`;
   `build`/`dependencies` -> `build`; `chore`/`maintenance` -> `chore`), matched
   case-insensitively and defaulting to `feat`. Labels are the machine-readable
   hint the issue carries about the kind of change.
3. **The scope is only taken from a conventional issue title at creation.** The
   task (the issue) rarely names a scope before any turn runs, so the created
   title normally has no scope; the reconciliation step (below) adds one when
   the applied outcome makes it clear. An issue label names the kind of change
   (the type), not the area of the code, so labels are not a scope source. When
   neither the task nor the outcome makes a scope clear, no scope is invented.
   A free-form issue body is not parsed for a scope either: turning prose into an
   area name is semantic inference, so "clear from the task" means the
   deterministic signal a conventional issue title carries, not any area a human
   happens to mention in the body.

Alternatives considered: a configured `type`/`scope` (rejected by the review);
inferring the type with the model from the issue prose (rejected: the runtime's
structured result deliberately does not carry machine-readable agent output, and
readiness already sets the precedent that objective facts are computed, not
self-reported); deriving the type from the generated OpenSpec change at creation
(rejected: the change does not exist until the propose turn commits).

### Compact the summary from the issue title

The summary is the issue title with its structure normalized and its length
bounded:

- a conventional prefix, if present, is split off as the type/scope rather than
  repeated in the summary;
- an existing trailing `…` left by an earlier compaction is dropped before the
  summary is measured, so a summary is never shortened on top of a previous
  shortening;
- leading/trailing whitespace is trimmed and internal whitespace runs collapsed
  to one space;
- a trailing period is dropped;
- the summary is shortened at the last word boundary that keeps the whole
  `type(scope): summary` subject under 72 characters, appending `…` when it is
  shortened.

72 is the project's own commit-subject limit in `AGENTS.md` ("keep the subject
under 72 characters"), so the compaction rule is the project's rule rather than
an invented one. This is what "compact as much as possible" means here: remove
the structural noise and enforce the limit as far as the author's words allow.
No words are rewritten - no paraphrase, no imperative rewrite - which would risk
changing the author's meaning. A declarative title therefore stays declarative,
just shorter; when even the structural compaction cannot fit within the limit,
the summary is cut at a word boundary with an ellipsis rather than rephrased.

Alternative considered: a semantic rewrite toward the imperative (rejected:
rewriting the author's words is out of scope and needs a model call whose output
the architecture does not trust as an objective value).

### Verify the title against the applied outcome at the end of the apply job

The outcome is the commits the apply turn itself adds, so the orchestrator
records the branch tip before the turn runs and, once the turn's commits are
published, reads the commit subjects in `beforeTip..HEAD` - only what the apply
turn committed. It keeps those that are recognized Conventional Commit subjects
and not OpenSpec bookkeeping (a subject scoped `openspec`, such as the apply
turn's archive commit) and uses them to reconcile the title:

- when the implementation subjects agree on a type, the title is recomposed with
  that type and, when the subjects that carry a scope agree on a single one, that
  scope (replacing a scope deduced from the issue title when the two differ),
  keeping the summary the title already carries, shortened further at a word
  boundary when the new type or scope would push the subject to the
  commit-subject limit, and updated when it differs from the current title;
- when the implementation subjects agree on a type but the subjects that carry a
  scope disagree or none carries one, only the agreed type is reconciled and the
  scope deduced from the issue title is kept (usually none), so an author's
  explicit scope survives an outcome that does not determine one;
- when the implementation subjects do not agree on a type, or carry no
  Conventional Commit subject, the deduced title is kept unchanged.

The summary is not recomputed. The title created at `start` already carries the
compacted issue-title summary, and reconciliation only corrects the type and
scope, so the engine parses the current title and reuses its summary rather than
resolving the issue a second time. Parsing recognizes only the project's
Conventional Commit types (the same set deduction uses) and reads a single
optional scope; a title that does not parse as such a subject - including one
whose prefix carries an unrecognized type - is left unchanged. The reused
summary has any stale trailing `…` dropped before it is measured, so the
re-shortening below replaces an earlier ellipsis rather than stacking a second
one. This keeps reconciliation a pure function of
the title and the applied commits, with no extra provider read. Applying a
longer type or a scope still enlarges the subject, so the kept summary is
re-compacted with the same rule when the new prefix would push it to the limit;
that bounds the reconciled subject without rewriting the author's words.

Scoping to the turn's own commits matters: the workflow branch already carries
the propose turn's `docs(openspec)` commits, so reading every commit ahead of
the base would mix bookkeeping subjects with the implementation and make the
commits "disagree" almost always, leaving the deduced title untouched. The
turn's own commits are the applied outcome; the earlier propose commits are not.
The same reasoning applies inside the turn's own range: an apply turn folds
`openspec archive` into its final commit and may also add a separate
`openspec`-scoped bookkeeping commit, so bookkeeping subjects are ignored when
the applied type and scope are derived. Otherwise those subjects would make a
turn that both implements and archives "disagree" with itself and the deduced
title would never be corrected.

The commits are the outcome because the project requires turns to commit with
Conventional Commit messages, so their subjects are an authoritative record the
orchestrator can read from the repository rather than trust from agent prose
(the same principle as the readiness predicate and the propose "no progress"
check). Reading the range is also robust to a turn that commits more than once:
every implementation subject the turn added is considered, and a mixed set of
implementation types keeps the deduced title rather than guessing.

Alternative considered: reconciling from the archived OpenSpec change name and
its touched capabilities. The change is archived by the apply turn and is no
longer an active change, so reading it needs new filesystem/CLI surface, and the
capability names do not map cleanly to short Conventional Commit scopes. The
committed subjects are already conventional and already published, so they are
the smaller, more reliable source.

### The title update is best-effort and does not fail the workflow

A failed title update leaves a title that is still a valid Conventional Commit
subject, so it is a cosmetic failure rather than a broken workflow. The
orchestrator logs and reports it and still advances the workflow to
implementing/ready-for-review, matching the requirement that a workflow does not
regress for a non-essential step. This is narrower than the ready-for-review
transition, which does fail the workflow because a task-complete pull request
stuck in draft blocks the human.

### Compose in the engine through pure helpers, and update through the provider

Deduction and compaction live in `src/orchestrator/title.ts` as pure functions
so they are unit-testable without a provider or a runtime. The engine calls them
at creation and uses a companion function there to rebuild a subject with a new
type and scope while keeping its summary, re-shortening that summary at a word
boundary when the new prefix would reach the commit-subject limit, at
reconciliation. The title update goes through a new
`RepoProvider.updatePullRequest` operation, so the provider keeps transporting
content and the GitHub adapter can use its REST endpoint without leaking into
orchestration.

Reading the applied subjects is an internal `SandboxHandle` addition
(`commitSubjects(from)`), alongside the existing repository-state reads, so the
engine does not reach into git itself; the engine passes the tip it recorded
before the turn, so the method returns only that turn's subjects.

## Risks / Trade-offs

- [The deduced `type` can be wrong when the issue carries no type label and no
  conventional title] -> Accepted; it defaults to `feat`, and the apply-time
  reconciliation corrects it from the applied commits, which is the outcome.
- [Label names are repository conventions, not enforced by the workflow] -> The
  mapping covers GitHub's default labels and is documented; an unmatched label
  falls back to `feat`, and a conventional issue title overrides it.
- [Mechanical compaction can truncate a long declarative title mid-thought] ->
  Accepted; the limit is the project's own, the truncation happens at a word
  boundary with an ellipsis, and an author can shorten the issue title or write
  it conventionally. Reconciliation can shorten the kept summary a little
  further when the applied type or scope lengthens the prefix, but it never
  rewrites the author's words.
- [The applied commits may disagree on a type or scope] -> The orchestrator
  reconciles only what they agree on - the type - and keeps the deduced scope
  when they disagree on it; a disagreement on the type keeps the deduced title.
  The requirement covers both cases explicitly.
- [Reading commit subjects adds a git call to the apply path] -> Accepted; it is
  one `git log` over the turn's own commit range on the workspace already alive
  for the turn, and a failure to read it keeps the deduced title rather than
  failing the workflow.
- [A repository that wants a fixed type cannot force one] -> It can label its
  issues accordingly, or authors can write conventional issue titles; the
  review asked for deduction rather than configuration.

## Migration Plan

1. Add the pure title helpers; no behavior change until the engine uses them.
2. Compose the created title with the helpers in `start`.
3. Add `commitSubjects(from)` to the sandbox and `updatePullRequest` to the
   provider, with their test doubles.
4. Reconcile the title at the end of the apply turn from the tip recorded before
   that turn.
5. Document the deduction, compaction, and reconciliation.
6. Rollback is code-only: reverting the engine change restores the issue title,
   and the new provider/sandbox operations are additive.

## Open Questions

None blocking implementation. The review settled the two forks in the first
revision: the `type` is deduced from the issue context rather than configured,
and a `scope` is added only when the task (a conventional issue title) or the
applied outcome makes it clear. Mechanical compaction is the deliberate
boundary for the summary - it keeps the author's words and enforces the
project's length limit - so no model rewrite is proposed; a future change can
revisit imperative summaries if the project wants them.
