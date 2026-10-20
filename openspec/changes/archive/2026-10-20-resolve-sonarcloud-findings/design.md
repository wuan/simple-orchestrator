# Design

## Context

See `proposal.md` - Why. The SonarCloud project (`wuan_simple-orchestrator`) is
public, so the open findings and the quality gate can be read from its API
without a token. At the time of writing the analysis reports 87 unresolved
findings (`typescript:S7503` x31, `S9382` x17, `S6551` x12, `S6582` x4,
`S5443` x4, `S8786` x3, `S7778` x3, `S3776` x3, `S5906` x2, `S2187` x2 and one
each of `S6959`, `S4624`, `S3358`). The gate fails only on
`new_security_rating = D`, caused by one `CRITICAL` `S5443` on new code; the
other conditions (new reliability, maintainability, coverage and duplicated
lines) already pass.

Two repository precedents shape this change. First, behaviour changes are
recorded as capabilities under `openspec/specs/`, and repository-wide concerns
have been recorded this way before (`project-documentation`,
`continuous-integration`). Second, the orchestrator's readiness predicate marks
a change READY only when every artifact reports `done`; a change that sets
`skip_specs: true` reports `specs` as `skipped`, never `done`, so a zero-delta
change can never reach READY (see `render-diagrams-with-mermaid` and
`run-tests-once-in-ci`). A spec artifact is therefore mandatory even for a
refactor.

## Goals / Non-Goals

**Goals:**

- Clear the entire open-findings backlog, not only the single gate-blocking
  finding, and leave the gate passing with an empty issue list.
- Keep production behaviour unchanged; every edit is either an equivalent
  refactor or confined to test doubles and test-only paths.
- Specify the resulting quality, security, performance and test-discovery
  contracts so future regressions are caught against a written requirement.

**Non-Goals:**

- Making the quality gate block the build. The CI scan already runs; the issue
  asks to fix the findings, not to change enforcement. A `sonar.qualitygate.wait`
  gate is a separate change.
- Excluding test-support code from analysis to make the numbers look better. The
  fakes and emulator stay analysed; their findings are resolved in place.
- Any new dependency, script or configuration knob.

## Decisions

### Decision: resolve the whole backlog, not just the gate blocker

The gate already passes on reliability and maintainability; only new-code
security fails. Fixing one `S5443` would turn the gate green and leave 86
findings and a C reliability rating. The issue is phrased as "the issues of this
project", the dashboard tracks the rest as debt, and an empty list is the only
state that keeps the analysis meaningful. Alternative: fix only the new-code
findings (rejected: leaves the backlog and the overall ratings untouched, so the
same issue recurs). Alternative: exclude test-support directories from the
analysis (rejected as a Non-Goal - it suppresses findings rather than fixing
them).

### Decision: record the contract as a new `code-quality` capability

The findings fall into durable classes - analysis cleanliness, private
temporary workspaces, linear-time parsing, test discoverability - that are worth
stating as requirements. The readiness predicate also requires a `done` specs
artifact, which `skip_specs` cannot produce, so the contract is written as a
real capability following `project-documentation`. Alternative: `skip_specs`
(rejected: the approval gate can never open).

### Decision: private temporary workspaces via `fs.mkdtemp`

The `S5443` findings reuse fixed paths (`/tmp/contract-work`,
`/tmp/fake-workspace-*`, `/tmp/fake-store`) under a world-writable directory, so
another local user could pre-create or read them. Clone, fetch and push
destinations in the contract tests will be created with `fs.mkdtemp` under
`os.tmpdir()` and removed per test, and `FakeSandbox` will derive its store and
workspace paths from a private per-instance temporary directory created with
`fs.mkdtemp`, exposing them so the tests that assert the store path compare
against the real value rather than a hard-coded `/tmp` literal. This is the only
security finding class and it is fixed in place rather than suppressed.

### Decision: linear-time patterns by removing ambiguity

`S8786` flags three patterns whose nested/ambiguous quantifiers give
super-linear backtracking: `SUBJECT_PATTERN` in `title.ts`, `MARKER` in
`usage.ts` and the `Link`-header pattern in `rest.ts`. Each is rewritten to a
linear form that keeps the same accepted language - the subject pattern is
anchored and hoists the optional scope so the alternation cannot backtrack, the
marker uses a negated/atomic-style body instead of `[\s\S]*?`, and the link
pattern bounds its capture by the delimiters it already requires.

### Decision: refactor where behaviour-safe, suppress only the rule/signature conflicts

Most findings are equivalent refactors: an initial value for the `reduce` in
`latestHumanReview`; dedicated matchers (`toHaveLength`, `toBeNull`); an
extracted `state` statement for the nested ternary; a nested template literal
hoisted to a constant; merged `Array#push` calls; optional chaining; typed field
reads instead of `String(body?.['x'] ?? '')`; and top-level `await` in the three
entry points. Two classes conflict with an intentional design and are handled
explicitly:

- `S7503` (`async` without `await`, 31 findings) fires on test doubles that
  implement an async contract (`RepoProvider`, `Sandbox`, `OpenSpec`, the
  runtime, the emulator request method, credential resolvers). Removing `async`
  would break the interface, so each method returns `Promise.resolve(...)`
  explicitly instead, which satisfies the contract and the rule.
- `S9382` (`await` inside a loop, 17 findings) fires on loops that must stay
  sequential: rate-limited pagination (`rest.paginate`), ordered polling
  (`poller`, `index.runLoop`, `run --once`), repository/credential iteration
  (`credentials`, `provider`), Git worktree removal (`sandbox`) and label
  transitions (`engine`). Where the awaits are genuinely independent they are
  parallelised with `Promise.all`; where order is the point, the loop stays and
  the finding is resolved as accepted with a one-line justification next to it,
  so the analysis is clean and the reason is reviewable. Suppression is used
  only for these signature/sequencing conflicts, never for a fixable defect.

### Decision: make contract-battery tests visible to the analyser

`S2187` (`test file with no tests`) fires on the two contract test files because
their cases live in the shared `runProviderContractTests` battery, which the
analyser cannot see through. The battery stays the single source of contract
cases; each file additionally declares a discoverable test (through a `describe`
that enumerates the battery, or an accompanying assertion) so the file is no
longer empty to the runner or the analyser.

## Risks / Trade-offs

- [Touching roughly thirty files risks an accidental behaviour change] -> every
  group is behaviour-preserving or test-only, and `npm run verify` plus the
  existing unit, contract and e2e suites gate each group.
- [Parallelising an `await` loop changes ordering or rate limiting] -> only
  independent awaits are parallelised; ordered and rate-limited loops stay
  sequential and are documented.
- [Suppression could hide a real defect later] -> suppression is limited to
  `S7503`/`S9382` where the rule conflicts with the async contract or the
  required ordering, carries a justification, and never applies to `S5443`,
  `S8786` or `S6959`.
- [The SonarCloud state is external and time-based] -> after merge the result is
  verified against the issues and quality-gate APIs, not the dashboard alone.
- [The change is larger than a typical one-issue change] -> the task groups are
  ordered and separable; the security group alone clears the gate, so a
  narrower review can land it first if the reviewer prefers.

## Migration Plan

None. A refactor with no runtime effect is picked up on the next merge; rollback
is a revert of the branch.

## Open Questions

None.
