# Tasks

## 1. Report turn usage from the runtime

- [x] 1.1 Extend `TurnUsage` with `model` and token counts by kind (input,
      output, reasoning, cache read, cache write) alongside the existing total,
      and have the embedded OpenCode host derive them from the turn's assistant
      messages, summing each bucket; verify unit tests cover model extraction,
      every bucket and the total, and a session with no messages
- [x] 1.2 Surface that usage through `OpenCodeHost.runPrompt` and
      `OpenCodeClient.runSkill`, invoking `onUsage` before the success assertion
      so a failing turn still reports what it consumed; verify a unit test covers
      usage reported on a turn that then throws
- [x] 1.3 Update the fake runtime to report a model and token counts by kind and
      verify the runtime and engine fakes still satisfy their tests

## 2. Measure elapsed time and attempts in the engine

- [x] 2.1 Record the wall-clock time around the runtime call in `runTurn`,
      including the retry, count the attempts `withRetry` made, and merge both
      into the turn's usage; verify an engine test reports elapsed time and
      attempts for a runtime that reports no duration and for a retried turn
- [x] 2.2 Accumulate partial usage from `onUsage` and pass it with the measured
      elapsed time and attempts to the failure path; verify an engine test
      reports elapsed time, attempts, and known usage for a failed turn

## 3. Render the metrics on every comment

- [x] 3.1 Render one metrics line (model, per-kind token counts and their total,
      elapsed, attempts with retries; unknown model or tokens stated explicitly)
      and append it to the propose/apply turn comment, the readiness prompt, and
      the failure comment; verify engine tests assert the line on a propose turn,
      an apply turn, a readiness prompt, and a failure
- [x] 3.2 Embed a machine-readable usage marker in every turn comment and have
      lifecycle comments (completion, cancellation, and a transition failure
      such as the revise limit) repeat the most recent turn's metrics, labelled
      as the last turn's, from the comments the poll already fetched; verify
      engine tests assert the lifecycle comments carry the previous turn's
      metrics and that no process state is required to recover them
- [x] 3.3 Confirm a lifecycle comment posted before any turn ran states the
      metrics as unknown rather than omitting them, and verify a test asserts it
- [x] 3.4 Document that every comment reports the model, the token counts by
      kind and total, the elapsed time, and the attempts in the README
      agent-runtime section

## 4. Verification

- [x] 4.1 Run `npm run verify` on Node 24 and verify format, lint, typecheck,
      tests, and OpenSpec validation all pass

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result and that the added capability requirements appear
  in the main specs.
