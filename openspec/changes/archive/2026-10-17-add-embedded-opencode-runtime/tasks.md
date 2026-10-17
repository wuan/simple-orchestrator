# Tasks

## 1. Runtime floor

- [x] 1.1 Raise `engines.node` to `>=24` in `package.json` so the embedded SDK's
      syntax is supported, and verify the installed local runtime is Node 24
- [x] 1.2 Pin `node-version: 24` in `.github/workflows/ci.yml` and verify the
      workflow still runs the `verify` gate

## 2. Embedded client and host

- [x] 2.1 Add an `OpenCodeHost` seam and `EmbeddedOpenCodeClient` in
      `src/runtime/opencode/sdk-client.ts` that creates the host lazily, reuses
      it across turns, runs each turn in a fresh session at the turn workspace,
      and closes the host on `dispose`, and verify unit tests cover reuse, one
      session per turn, result mapping, abort propagation, and disposal
- [x] 2.2 Add `src/runtime/opencode/sdk-host.ts` mapping the embedded SDK to the
      host seam (create session, prompt, wait, read the transcript), with the
      SDK loaded lazily and injectable for tests, and verify unit tests cover
      the final-assistant-text extraction and the call mapping with a fake SDK

## 3. Entry point and docs

- [x] 3.1 Rewire `src/run.ts` to construct the embedded client and supply the
      `OpenCodeRuntime`, disposing the client when the service stops, and verify
      importing the entry point does not load the SDK
- [x] 3.2 Update the README (requirements, agent runtime, run) to describe the
      embedded host, the Node 24 floor, and the removed server requirement, and
      verify the described entry point and behaviour match the code

## 4. Verification

- [x] 4.1 Run `npm run verify` (format, lint, typecheck, tests, OpenSpec
      validation) on Node 24 and verify everything passes

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result and that the modified capability requirements
  appear in the main specs.
