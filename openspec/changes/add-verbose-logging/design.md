# Design

## Context

See `proposal.md` for motivation and the spec deltas for the required behavior. The service already threads an injected `logger: (message: string) => void` from `index.ts` through `service.ts` into the `Poller` and `WorkflowEngine`, defaulting to a no-op. Today it is used for a handful of workflow-level messages and `runLoop` writes a one-line summary to stderr only when a cycle starts a workflow or takes an action. This change builds on that seam rather than introducing a logging subsystem.

## Goals / Non-Goals

**Goals:**

- Let an operator turn on verbose diagnostics with either a CLI option or a configuration field, with a concise default.
- Surface enough per-poll-cycle and per-turn detail to follow the service without attaching a debugger.
- Guarantee secrets never reach the output, at any verbosity.

**Non-Goals:**

- Structured or JSON logs, log levels beyond the verbose on/off toggle, log rotation, metrics, or tracing.
- Per-repository verbosity: verbosity is process-wide for the run.
- Logging every provider HTTP call or agent step; diagnostics stay at the cycle and turn boundary.

## Decisions

### Decision: Reuse the injected logger with a verbosity gate

Verbose diagnostics are written through the existing injected `logger` seam. `index.ts` decides whether the logger is the real sink or a no-op based on the effective verbosity, so `service.ts`, `poller.ts`, and `engine.ts` remain unaware of the switch and no new dependency is added.

Alternatives considered: a structured logging library (rejected: adds a dependency and surface with no current demand); passing a boolean verbosity flag through every layer (rejected: spreads the concern instead of confining it to the sink).

Consequence: the engine keeps emitting the same diagnostics regardless of verbosity; the sink chooses to drop or keep them. Diagnostic messages that are useful only when verbose are still cheap to build.

### Decision: The switch lives in both the CLI and the configuration file

The `--verbose`/`-v` option is parsed into `CliOptions`, and an optional `logging.verbose` boolean is added to the top-level configuration (a `logging` block, consistent with the existing `limits` and `workspace` blocks). Effective verbosity is the logical OR of the two.

Alternatives considered: CLI only (rejected: a service run under a process manager is easier to configure from the file); configuration only (rejected: interactive runs should not require editing a file); a quiet/verbose/normal level enum (rejected: the issue asks for a verbose toggle, and a level enum is a larger surface to define and test).

Consequence: because the option can only add verbosity, there is no precedence conflict and no `--no-verbose` counterpart.

### Decision: Verbose diagnostics go to stderr

Verbose output is written to stderr. The concise `--once` summary keeps writing to stdout as it does today, and the long-running loop keeps using stderr.

Alternatives considered: everything to stdout (rejected: it mixes the summary channel with diagnostics); everything to stderr (rejected: changes existing `--once` behavior for no benefit).

### Decision: Redact resolved secrets at the sink

The real logger wraps the stream writer with a redactor seeded from the credential values resolved at startup, replacing any occurrence of a known secret with a fixed marker. Central redaction means a future diagnostic that happens to include a credential cannot leak it, rather than relying on every call site to be careful.

Alternatives considered: pattern-based redaction without knowing the values (rejected: brittle, hard to prove); trusting call sites (rejected: fragile under change).

Consequence: the service must resolve credentials before constructing the logger, which it already does during `createService`; a failure to resolve a credential still fails startup with the existing error.

### Decision: Diagnostics at the cycle and turn boundary

Verbose messages cover: the start of a poll cycle and per-repository discovery; each workflow decision with its reason; turn start (skill, pull request, branch), turn outcome (commits or failure), and readiness results; and retries. Provider and runtime internals are not logged.

Rationale: these boundaries are where an operator's mental model breaks today, and they are stable enough to specify without coupling the spec to a transport.

## Risks / Trade-offs

- [Verbose output becomes noise across many repositories] -> Keep it to one line per cycle and per workflow; do not log per-HTTP-call.
- [A verbose diagnostic leaks a credential] -> Redact at the sink and cover it with a test that runs verbose with a configured credential.
- [The feature creeps into structured logging, metrics, or levels] -> Explicit non-goals; the option is a boolean toggle only.
- [Engine diagnostics change existing output when verbose is off] -> The no-op sink drops verbose-only messages; with verbosity off the observable output is unchanged.

## Migration Plan

None required. The configuration field is optional, the CLI option is additive, and the default is off, so existing configurations and commands keep their current behavior. Rollback is to stop using the option and the field.

## Open Questions

- Whether verbosity should later be selectable from an environment variable (for parity with credential configuration) is deferred; it does not change the specs or the task breakdown.
