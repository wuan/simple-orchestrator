# Tasks

## 1. Security: private temporary workspaces (clears the gate)

- [ ] 1.1 In `src/orchestrator/testing/fake-sandbox.ts`, derive the store and
      workspace paths from a private per-instance temporary directory created
      with `fs.mkdtemp` under `os.tmpdir()` instead of the fixed
      `/tmp/fake-workspace-*` and `/tmp/fake-store` literals, and update the
      assertions in `src/orchestrator/poller.test.ts`,
      `src/orchestrator/engine.test.ts` and
      `src/orchestrator/container-e2e.test.ts` to compare against the exposed
      value; verify the sandbox, poller, engine and container-e2e tests pass and
      the created paths are unique and owner-only.
- [ ] 1.2 In `src/provider/contract.ts`, replace the fixed `/tmp/contract-work`
      clone/fetch/push destination with a per-test directory created via
      `fs.mkdtemp` and removed afterwards; verify the provider contract tests
      pass.
- [ ] 1.3 Verify the analysis no longer reports `typescript:S5443` on
      `src/orchestrator/testing/fake-sandbox.ts` or `src/provider/contract.ts`
      after the next scan.

## 2. Reliability: initial value and linear-time patterns

- [ ] 2.1 In `src/provider/reviews.ts`, give the `reduce` in
      `latestHumanReview` an initial value so the newest-review selection cannot
      throw on an empty input; verify the reviews unit tests pass, including the
      empty-list case.
- [ ] 2.2 Rewrite `SUBJECT_PATTERN` in `src/orchestrator/title.ts` to a linear
      form that accepts and rejects the same subjects; verify the title unit
      tests pass.
- [ ] 2.3 Rewrite `MARKER` in `src/orchestrator/usage.ts` to a linear form with
      the same accepted language; verify the usage-marker unit tests pass.
- [ ] 2.4 Rewrite the `Link`-header pattern in `src/provider/github/rest.ts` to a
      linear form; verify the `nextLink` unit tests pass.
- [ ] 2.5 Confirm `typescript:S8786` and `typescript:S6959` no longer appear for
      these files after the next scan.

## 3. Test discovery and correctness

- [ ] 3.1 In `src/provider/fake/fake-provider.contract.test.ts` and
      `src/provider/github/github-provider.contract.test.ts`, declare a test the
      analyser can see (for example, a `describe` that enumerates the shared
      battery, or an accompanying assertion) while keeping
      `runProviderContractTests` as the single source of contract cases; verify
      both files run and each reports at least one test.
- [ ] 3.2 In `src/orchestrator/e2e.test.ts`, replace the generic length
      assertion with `toHaveLength`; in `src/orchestrator/watermark.test.ts`,
      replace the generic assertion with `toBeNull`; verify both tests pass.
- [ ] 3.3 In `src/provider/github/map.ts`, extract the nested ternary that maps
      pull-request state into an independent statement; verify the mapping tests
      pass and open/closed/merged states are unchanged.
- [ ] 3.4 Confirm `typescript:S2187`, `typescript:S5906` and
      `typescript:S3358` no longer appear for these files after the next scan.

## 4. Complexity and readability

- [ ] 4.1 Refactor `decide` in `src/orchestrator/decision.ts` to a cognitive
      complexity of at most 15 without changing the decision table; verify the
      decision unit tests pass.
- [ ] 4.2 Refactor `pollOnce` in `src/orchestrator/poller.ts` to reduce
      cognitive complexity and hoist the nested template literal into a
      constant or helper; verify the poller unit and e2e tests pass.
- [ ] 4.3 Refactor the request handler in
      `src/provider/github/testing/in-memory-github.ts` to reduce cognitive
      complexity and read typed fields instead of `String(body?.['x'] ?? '')`;
      verify the emulator tests and the provider contract tests pass.
- [ ] 4.4 Merge the consecutive `Array#push` calls in `src/runtime/sandbox.ts`
      into a single call; verify the sandbox argument tests pass.
- [ ] 4.5 Confirm `typescript:S3776`, `typescript:S4624`, `typescript:S7778` and
      `typescript:S6551` no longer appear for these files after the next scan.

## 5. Modernisation

- [ ] 5.1 Replace the promise chains in `src/index.ts`, `src/runner.ts` and
      `src/run.ts` with top-level `await`; verify `npm run build` succeeds and
      the entry points still set the same exit codes on success and failure.
- [ ] 5.2 Apply optional chaining where flagged in
      `src/orchestrator/engine.ts`, `src/orchestrator/usage.ts`,
      `src/orchestrator/watermark.ts` and `src/provider/github/transport.ts`;
      verify the affected unit tests pass.
- [ ] 5.3 Confirm `typescript:S7785` and `typescript:S6582` no longer appear for
      these files after the next scan.

## 6. Async hygiene in test doubles and loops

- [ ] 6.1 Move the `async`-without-`await` methods to explicit
      `Promise.resolve(...)` returns in `src/provider/fake/fake-provider.ts`,
      `src/orchestrator/testing/fake-sandbox.ts`,
      `src/orchestrator/testing/fake-openspec.ts`,
      `src/runtime/fake/fake-runtime.ts`, `src/runtime/unconfigured.ts`,
      `src/provider/github/testing/in-memory-github.ts` (`request`),
      `src/provider/github/testing/recording-commands.ts` and
      `src/config/credentials.ts` (`resolve`); verify `npm run typecheck` and the
      unit tests pass.
- [ ] 6.2 For `await`-in-loop findings, parallelise the independent awaits
      (for example repository credential resolution) with `Promise.all` and keep
      the order-dependent or rate-limited loops sequential, each with a one-line
      justification where the finding is resolved as accepted; verify the
      affected unit, contract and e2e tests pass and no ordering changes.
- [ ] 6.3 Confirm `typescript:S7503` and `typescript:S9382` no longer appear for
      these files after the next scan.

## 7. Documentation

- [ ] 7.1 Add a short "Code quality" note to `README.md` (or `AGENTS.md`) stating
      that the SonarCloud gate must stay passing and how to query the project's
      open issues; verify the documented command or URL resolves.

## 8. Verification

- [ ] 8.1 Run `npm run verify` and confirm the format check, lint, typecheck,
      unit and integration tests, and strict OpenSpec validation all pass.
- [ ] 8.2 Verify `openspec validate --strict resolve-sonarcloud-findings` passes
      and `openspec status --change resolve-sonarcloud-findings` reports every
      artifact `done`.
- [ ] 8.3 After merge, verify through the SonarCloud issues and quality-gate APIs
      that the project reports zero open issues and a passing gate.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result folds the `code-quality` requirements into
  `openspec/specs/code-quality/spec.md`.
