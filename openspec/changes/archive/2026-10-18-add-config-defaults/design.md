# Design

## Context

See `proposal.md` for motivation and the spec delta for the required behavior.
`src/config/loader.ts` parses each repository entry independently, filling
`baseBranch`, `pollIntervalSeconds`, `maxReviseRounds`, and `labels` from the
built-in defaults in `src/config/types.ts` when an entry omits them, and failing
fast when an entry omits a required `provider`, `owner`, `name`, or `credential`.
This change adds one more, operator-supplied layer beneath the entry and above
the built-in defaults.

## Goals / Non-Goals

**Goals:**

- Let an operator state values shared by every repository once, then specify only
  what differs per entry.
- Keep the merge order obvious and testable: entry, then `defaults`, then the
  built-in defaults.
- Preserve fail-fast validation and the existing error messages that name the
  offending repository or entry.

**Non-Goals:**

- Named profiles, per-provider or per-owner groups, or include/import directives.
- Environment-variable interpolation or templating anywhere in the configuration.
- Changing how the top-level `limits`, `workspace`, `logging`, or `agent` blocks
  are read; they are already single-instance defaults.

## Decisions

### Decision: a top-level `defaults` block shaped like a repository entry minus `name`

`defaults` accepts the same fields as a repository entry except `name`:
`provider`, `owner`, `credential`, `baseBranch`, `pollIntervalSeconds`,
`maxReviseRounds`, and `labels`. It is parsed with the same helpers as a
repository entry, so an invalid value in `defaults` fails fast with the same
message form, once at the `defaults` context.

Alternatives considered: named profiles referenced by each entry (rejected: a
larger surface — naming, references, and missing-profile errors — for a file that
is already a single shared document); grouping repositories under a provider or
owner key (rejected: couples the layout to two particular fields and does not
cover the credential, branch, interval, or labels); allowing `defaults` to set
`name` (rejected: two entries would collapse to one identity).

### Decision: merge order is entry over defaults over built-in

For each repository, a scalar field resolves as the entry's value, else
`defaults`, else the documented built-in default. Label names resolve the same
way, key by key, so an entry that overrides only `trigger` still inherits the
default `trigger` from `defaults` and the built-in value for every other label.
The merge happens before validation, so the required-field check sees the
effective value.

Alternatives considered: deep-merging every nested object (rejected: `labels` is
the only nested object, and a general deep merge is more machinery than the
behavior needs); validating entries before the merge (rejected: an entry that
legitimately inherits a required field would be rejected).

### Decision: `name` stays per entry

`name` is the repository's identity in `repoKey`, so it is never satisfied from
`defaults`. An entry without `name` fails startup naming the entry, even when
`defaults` is present.

Alternatives considered: allow `defaults.name` and reject duplicates later
(rejected: it invites a configuration that can only ever describe one repository,
and duplicate detection is a separate concern).

### Decision: implement the merge in the loader, not the configuration model

`loadConfigFile` / `parseConfig` keep returning a fully-resolved
`OrchestratorConfig`, so `RepositoryConfig` stays complete and every consumer
downstream continues to read concrete values. `defaults` is an input-only
concept; it never appears in the parsed model.

Alternatives considered: exposing the partial defaults in `OrchestratorConfig`
and resolving lazily (rejected: it pushes the "which value won" question into
every consumer and makes the effective configuration harder to test).

## Risks / Trade-offs

- [A shared `defaults.credential` silently applies a token to a repository the
  operator did not intend] -> The merge is explicit and documented; an entry can
  always override `credential`, and fail-fast validation still names a repository
  whose credential cannot be resolved.
- [Precedence is easy to get backwards] -> Specify the order in one requirement,
  test inheritance and override separately, and cover the nested `labels` case.
- [A future scalar field is added and forgotten in `defaults`] -> `defaults`
  accepts the repository-entry fields explicitly; adding a field to both is a
  deliberate, reviewed edit, and the loader tests enumerate the defaultable
  fields.

## Migration Plan

None required. The block is optional and additive; a configuration without
`defaults` resolves exactly as it does today. Rollback is to delete the block and
spell the values out in each entry again.

## Open Questions

- Whether `defaults` should later be extended to the top-level `limits`,
  `workspace`, `logging`, and `agent` blocks, or to named profiles, is deferred.
  Those blocks are already single-instance, and the issue is about repeated
  per-repository values.
