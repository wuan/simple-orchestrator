# Tasks

## 1. Configuration and CLI option

- [x] 1.1 Add an optional `logging.verbose` boolean to the configuration model and loader, defaulting to false, and verify loader tests cover present, absent, and non-boolean values
- [x] 1.2 Parse `--verbose` (`-v`) in the CLI argument parser and list it in the usage text, and verify `parseCliArgs` tests cover the option and the help output
- [x] 1.3 Compute the effective verbosity as the CLI option OR the configuration field and use it to select the logger passed to the service and poller, and verify a unit test enables diagnostics through each source independently
- [x] 1.4 Document `logging.verbose` and `--verbose` in `README.md` and `docs/configuration.md`, and verify the documented example parses with `parseConfig`

## 2. Redaction

- [x] 2.1 Wrap the output sink in a redactor seeded with the resolved credential values, replacing any occurrence with a fixed marker, and verify a unit test redacts each seeded value
- [x] 2.2 Verify an integration test runs the service verbosely with a configured credential and asserts the credential value never appears in captured output

## 3. Verbose poll diagnostics

- [x] 3.1 Emit a per-repository cycle message and discovery/start/action messages from the poller, and verify poller tests capture them when verbose and omit them when not
- [x] 3.2 Emit the per-workflow decision and idle reason for in-flight workflows, and verify engine tests cover an idle decision and an action decision
- [x] 3.3 Verify a verbose poll cycle with no labeled issue and no in-flight workflow still reports that the repository was polled

## 4. Verbose turn diagnostics

- [x] 4.1 Emit turn start (skill, pull request, branch), turn outcome (commits or failure), and readiness results, and verify engine tests cover a successful propose turn with readiness, a successful apply turn, and a failing turn
- [x] 4.2 Emit a retry message consistent with the failure diagnostics, and verify the transient-failure test observes it
- [x] 4.3 Verify the non-verbose run produces no poll-cycle or turn diagnostics while the concise summaries are unchanged

## 5. Integration and operator docs

- [x] 5.1 Verify an end-to-end run with verbose enabled produces poll-cycle and turn diagnostics and an end-to-end run with verbose disabled matches the previous concise output
- [x] 5.2 Verify `npm run verify` passes (format, lint, typecheck, tests, and strict OpenSpec validation) and that the README documents the option end to end
- [x] 5.3 Verify verbose diagnostics are written to standard error and that a `--once` run with verbose enabled still prints only the per-repository summary lines to standard output

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result folds the new requirements into the `orchestrator-configuration` and `workflow-orchestration` main specs.
