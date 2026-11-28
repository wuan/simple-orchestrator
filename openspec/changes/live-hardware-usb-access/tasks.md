# Tasks

## 1. Configuration surface

- [x] 1.1 Add `devices?: string[]` and `groups?: (string | number)[]` to `EnvironmentSpec` and the environment defaults type; verify `npm run typecheck` passes.
- [x] 1.2 Parse and validate `devices` (non-empty absolute paths) and `groups` (non-empty names or numeric gids) in `src/config/loader.ts`; verify loader unit tests reject empty/relative paths, empty groups, and wrongly typed fields.
- [x] 1.3 Verify loader tests cover `defaults.environment` inheritance and per-entry override of the new fields, with arrays taken wholesale from the layer that sets them.
- [x] 1.4 Document `environment.devices` and `environment.groups` in `docs/configuration.md` with a PlatformIO example; verify the documented example parses via a loader test or `npm test`.

## 2. Container wiring

- [x] 2.1 Extend `DockerRunOptions` and `buildDockerRunArgs` with configured device paths (`--device <path>:<path>`) and groups (`--group-add <gid>`); verify argv unit tests cover both and the no-device regression case.
- [x] 2.2 Resolve configured group names to host gids and pass numbers through; verify unit tests cover a named group, a numeric gid, and an unknown group failing the turn.
- [x] 2.3 Check every configured device path at turn start (absolute, existing after symlink resolution, character device) before building the argv; verify container-client tests fail the turn naming the path when it is absent, dangling, or not a character device.
- [x] 2.4 Verify a stable symlink path is passed to Docker as the configured container path and that a replugged target is re-resolved on the next turn, using a fake runner and a temporary symlink fixture.
- [x] 2.5 Verify an environment without device fields produces the previous argv unchanged, with a regression test.

## 3. PlatformIO image and documentation

- [x] 3.1 Add `usbutils`, `libudev1`, and `libusb-1.0-0` to the `platformio` stage only; verify a `docker build --build-arg OPENCODE_SDK_VERSION=$(jq -r '.packages["node_modules/@opencode/sdk"].version' package-lock.json) --target platformio` succeeds and `lsusb` runs inside the built image.
- [x] 3.2 Verify the other flavours do not gain the packages, by building the `node` target or reviewing the Dockerfile diff.
- [x] 3.3 Update `environments/README.md` with the host prerequisites: udev `GROUP`/`MODE` rules, the `qtpy2`/`jtum120` `SYMLINK` names, ModemManager exclusion for the ESP32 CDC ports, and the macOS/USB/IP limitation; verify the documented commands and example match the configuration fields.

## 4. Live-hardware verification

- [ ] 4.1 Flash the QT Py ESP32-S2 from a PlatformIO turn using `/dev/qtpy2`; verify the firmware uploads and record whether the `ttyACM` node survives the ROM bootloader re-enumeration. If it does not, capture the dynamic-class follow-up instead of widening this change.
- [ ] 4.2 Read live measurements from the JT-UM120 using `/dev/jtum120`; verify the turn opens the `hidraw` node and prints voltage/current samples.
- [ ] 4.3 Run an end-to-end turn for the klimacontrol repository with the PlatformIO environment, devices, and `dialout` group; verify the turn sees the devices, builds the firmware, and completes.
- [x] 4.4 Run `npm run verify` and `openspec validate "live-hardware-usb-access" --type change --strict`; verify both pass.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- If task 4.1 shows the bootloader transition breaks a fixed node, propose a follow-up change for dynamic device-class exposure rather than folding it into this one.
- If portability across hosts becomes a requirement, extend the `devices` field with `usb:<vid>:<pid>` selectors as a later change; path entries stay valid.
