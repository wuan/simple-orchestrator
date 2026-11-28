# Tasks

## 1. Device entry descriptions

- [x] 1.1 Add a normalized `DeviceSpec` type (`path` plus optional `description`) to `src/config/types.ts` and change `EnvironmentSpec.devices` to use it; update `parseEnvironmentValues` in `src/config/loader.ts` to accept a bare absolute path or an object with a `path` and optional non-empty `description`, rejecting malformed entries, and update the consumers in `container-client.ts`/`sandbox.ts` to map to paths. Verify `npm run typecheck` passes.
- [x] 1.2 Extend `src/config/loader.test.ts` with cases for a bare path, an object with a description, an object without a description, a missing path, an empty or non-string description, and a non-object entry; verify `npm test -- src/config/loader.test.ts` passes.
- [x] 1.3 Update the `environment` field table and device-access example in `docs/configuration.md` to show the object form alongside the bare path; verify the documented YAML parses by adding or updating the example assertion in `src/config/examples.test.ts`.

## 2. Host hardware inventory

- [x] 2.1 Add a best-effort identity probe to `src/runtime/hardware.ts`: run `udevadm info --query=property --name=<path>`, parse `ID_VENDOR_ID`, `ID_MODEL_ID`, `ID_MODEL`, `ID_SERIAL_SHORT`, `SUBSYSTEM`, and `DEVLINKS`, and return `undefined` identity when the command is missing, exits non-zero, or reports nothing; inject the command runner for tests. Verify `src/runtime/hardware.test.ts` covers a successful probe, a failed probe, and a missing `udevadm`.
- [x] 2.2 Add a `HardwareManifest` builder that combines configured entries with their probed identity, keeps a configured description even when the probe fails, and exports the manifest path constant used by the turn instruction and the runner. Verify unit tests cover a described device, an undescribed device, and a probe failure.

## 3. Turn advertisement

- [x] 3.1 Compose the hardware advertisement in `src/runtime/opencode/opencode-runtime.ts`: pass an optional manifest into `buildSkillPrompt`, emit one line per exposed device with description and detected identity, name the manifest path, and leave the instruction unchanged when the environment has no devices. Verify `src/runtime/opencode/opencode-runtime.test.ts` covers a hardware turn, a turn whose environment has no devices, and a turn in an environment whose device list omits an ambient host device.
- [x] 3.2 Build the manifest in `OpenCodeRuntime.run` from `request.environment` before dispatching the turn, and pass it through `OpenCodeSkillRequest`; verify the runtime test asserts the client receives the manifest and the prompt names the manifest path.

## 4. Manifest delivery and diagnostics

- [x] 4.1 Carry the manifest in the container client payload and teach `src/runner.ts` to validate and write it to `/tmp/orchestrator-hardware.json` before prompting; add an injectable manifest writer so tests do not touch the real path. Verify `src/runtime/opencode/container-client.test.ts` sees the manifest in the payload and `src/runner.test.ts` covers a valid manifest, a malformed manifest, and the written file's contents.
- [x] 4.2 Log the resolved inventory through the container client's verbose logger so an operator can confirm a stable name resolved to the expected USB identity; verify the test asserts the log line is emitted only when a logger is provided.
- [x] 4.3 Update the device-access section of `docs/configuration.md` and the live-hardware section of `environments/README.md` to document the advertised instruction, the manifest path, and that sensors/display/pin maps remain repository-owned; verify the documented paths and field names match the implementation.

## 5. Integration verification

- [x] 5.1 Run `npm run verify` and `openspec validate "advertise-turn-hardware" --type change --strict`; verify both pass with no new lint, type, test, formatting, or spec errors.

## Workflow follow-up

- Archive the change after the implementation is reviewed and merged.
- Verify the archived specs carry the advertisement and manifest requirements into `agent-runtime` and `orchestrator-configuration`.
