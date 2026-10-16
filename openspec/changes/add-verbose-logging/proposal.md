# Proposal

## Why

When the service is running it prints almost nothing: a poll cycle only reports a one-line summary when it starts a workflow or takes an action. An operator cannot tell that the poller is alive, what it discovered, or why a workflow is idle, which makes the service hard to trust and hard to troubleshoot. A verbose logging option gives operators that runtime insight on demand, while keeping the default output concise.

## What Changes

- Add a `--verbose` (`-v`) command-line option and an optional `logging.verbose` configuration field that turn on verbose diagnostics for a run. The default stays concise.
- When verbose is on, emit per-poll-cycle diagnostics (repository, discovered issues, workflows started, per-workflow decision and idle reason) and per-turn diagnostics (skill, target, outcome, readiness result, retries).
- Guarantee that credentials and tokens never appear in output, redacting secret values from any diagnostic at every verbosity.
- Keep the machine-readable report intact by writing diagnostics to standard error, leaving the `--once` summary on standard output untouched.
- Document the option in the CLI usage, `README.md`, and `docs/configuration.md`.

## Capabilities

### New Capabilities

- None. Verbose logging changes the behavior of existing capabilities rather than introducing a new subsystem.

### Modified Capabilities

- `orchestrator-configuration`: add a configurable logging verbosity (CLI option and configuration field, default concise) and a guarantee that secrets are never written to output.
- `workflow-orchestration`: define the verbose per-poll-cycle and per-turn diagnostics the orchestrator emits when verbosity is enabled, and the standard-error channel that keeps the standard output report machine-readable.

## Impact

- **Code**: `src/index.ts` (CLI parsing, usage, logger wiring), `src/config/types.ts` and `src/config/loader.ts` (the `logging` block), `src/service.ts`, and `src/orchestrator/poller.ts` / `src/orchestrator/engine.ts` (diagnostic messages). The existing injected `logger` seam is reused.
- **Documentation**: `README.md` and `docs/configuration.md`.
- **Dependencies**: none. No new package is required.
- **Compatibility**: purely additive. With verbose disabled the observable output is unchanged, and there is no change to configuration that is already valid.
