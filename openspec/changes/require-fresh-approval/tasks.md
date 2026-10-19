# Tasks

## 1. Decision

- [x] 1.1 In `src/orchestrator/decision.ts`, act on an approval only when it is
      newer than `lastTurnAt`: apply in READY, revise before READY; an answered
      approval is idle in either phase.

## 2. Coverage

- [x] 2.1 Decision tests: a fresh approval in READY applies, an answered one is
      idle; verify in `src/orchestrator/decision.test.ts`.
- [x] 2.2 Engine test: an approval given while PROPOSING drives a propose turn
      that reaches READY, the next poll is idle, and a new approval applies;
      verify in `src/orchestrator/engine.test.ts`.

## 3. Documentation

- [x] 3.1 Update the README trigger rules and transition table for the fresh
      approval requirement.

## 4. Verification

- [x] 4.1 Run `npm run verify` and confirm formatting, lint, typecheck, the unit
      and integration tests, and OpenSpec validation all pass.
