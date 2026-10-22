# Tasks

## 1. Make cache volumes writable

- [x] 1.1 Add `buildCachePrepareArgs` to `src/runtime/sandbox.ts`: the root
      `chown` argv that makes a named cache volume writable by a user, mounted at
      the cache path; verify with a unit test in `src/runtime/sandbox.test.ts`.
- [x] 1.2 Prepare each scoped cache volume in
      `src/runtime/opencode/container-client.ts` before the turn container
      starts, once per volume per process, logging and continuing when the
      prepare container fails; verify with tests in
      `src/runtime/opencode/container-client.test.ts` that preparation runs
      before the turn and is skipped the second time.

## 2. Enforce per-turn limits

- [x] 2.1 Count only input, output, reasoning, and cache write against the token
      budget in `src/runtime/limits.ts`, falling back to the reported total when
      no per-kind counts are present; verify with tests in
      `src/runtime/limits.test.ts`.
- [x] 2.2 Wrap the service runtime in `LimitedRuntime` in `src/service.ts` so
      `config.limits` is enforced for every repository; verify with a test in
      `src/service.test.ts` that a turn exceeding a limit fails.

## 3. Report the turn's account on failure

- [x] 3.1 Carry the turn's summary and questions on `NoProgressError` in
      `src/orchestrator/engine.ts` and append them to the failure comment in
      `signalFailure`; verify with a test in `src/orchestrator/engine.test.ts`
      that the failure comment includes the summary.
- [x] 3.2 Extend `src/orchestrator/poller.test.ts` if it asserts on the failure
      comment, so the summary-bearing comment stays covered. Existing
      assertions still hold; no change was needed.

## 4. Integration checks

- [x] 4.1 Run `npm run verify` and confirm the format check, lint, typecheck,
      unit and integration tests, and OpenSpec validation all pass.
- [x] 4.2 Prove the cache fix against the failing repository's volume: the
      `buildCachePrepareArgs` argv turned
      `orchestrator-wuan-bo-android-gradle` from `NOT-WRITABLE` to `WRITABLE`
      for the turn user, so the next apply turn reuses its Gradle cache instead
      of re-downloading the toolchain.
