# Proposal

## Why

A multi-repository configuration repeats the same provider, owner, credential,
base branch, poll interval, and label values in every entry. That repetition is
noisy, easy to let drift apart, and hard to review, even though most repositories
in one project share those values. Operators want to state the shared values once
and keep only what differs per repository.

## What Changes

- Add an optional top-level `defaults` block that supplies repository-entry values
  shared by every repository in the file.
- Merge each repository entry over `defaults`, which merges over the documented
  built-in defaults: an entry's value wins, then `defaults`, then the built-in
  default. Nested `labels` merge key by key rather than replacing the whole block.
- Let `provider`, `owner`, `credential`, `baseBranch`, `pollIntervalSeconds`,
  `maxReviseRounds`, and `labels` come from `defaults`; keep `name` required on
  each repository entry because it is the repository's identity.
- Keep fail-fast validation, run after the merge, so an entry whose required
  fields are supplied by `defaults` is valid and one that still lacks a required
  field fails startup with an error naming the repository.
- Document `defaults` in `README.md`, `docs/configuration.md`, and
  `examples/config.yaml`; keep the existing fully-specified form valid.

## Capabilities

### New Capabilities

- None. This changes the behavior of an existing capability.

### Modified Capabilities

- `orchestrator-configuration`: add a shared repository `defaults` block merged
  beneath each repository entry.

## Impact

- **Code**: `src/config/types.ts` (a `RepositoryDefaults` model), `src/config/loader.ts`
  (parse `defaults` and merge it per entry), `src/config/loader.test.ts`
  (inheritance, per-entry override, label merge, and post-merge validation), and
  `src/config/examples.test.ts` (the documented example still parses).
- **Documentation**: `README.md`, `docs/configuration.md`, `examples/config.yaml`.
- **Dependencies**: none. No new package is required.
- **Compatibility**: purely additive. Existing fully-specified configurations
  parse and behave exactly as before; no existing field changes meaning.
