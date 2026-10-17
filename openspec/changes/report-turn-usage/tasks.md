# Tasks

## 1. Report turn usage from the runtime

- [ ] 1.1 Add `model` to `TurnUsage` and have the embedded OpenCode host derive
      `{ model, tokens }` from the turn's assistant messages, totaling input,
      output, reasoning, and cache read and write tokens; verify unit tests cover
      model extraction, the token total, and a session with no messages
- [ ] 1.2 Surface that usage through `OpenCodeHost.runPrompt` and
      `OpenCodeClient.runSkill`, invoking `onUsage` before the success assertion
      so a failing turn still reports what it consumed; verify a unit test covers
      usage reported on a turn that then throws
- [ ] 1.3 Update the fake runtime to report a model alongside tokens and verify
      the runtime and engine fakes still satisfy their tests

## 2. Measure elapsed time in the engine

- [ ] 2.1 Record the wall-clock time around the runtime call in `runTurn`,
      including the single retry, and merge it into the turn's usage; verify an
      engine test reports elapsed time for a runtime that reports no duration
- [ ] 2.2 Accumulate partial usage from `onUsage` and pass it with the measured
      elapsed time to the failure path; verify an engine test reports elapsed
      time and known usage for a failed turn

## 3. Render the metrics on turn comments

- [ ] 3.1 Render one metrics line (model, tokens, elapsed; unknown model or
      tokens stated explicitly) and append it to the propose/apply turn comment,
      the readiness prompt, and the failure comment; verify engine tests assert
      the line on a propose turn, an apply turn, a readiness prompt, and a
      failure
- [ ] 3.2 Confirm completion and cancellation comments carry no turn metrics and
      verify a test asserts they are unchanged
- [ ] 3.3 Document that every turn comment reports the model, token total, and
      elapsed time in the README agent-runtime section

## 4. Verification

- [ ] 4.1 Run `npm run verify` on Node 24 and verify format, lint, typecheck,
      tests, and OpenSpec validation all pass

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result and that the added capability requirements appear
  in the main specs.
