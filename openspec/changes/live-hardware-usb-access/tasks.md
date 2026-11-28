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
- [x] 3.4 Ship Python 3.12 in the `platformio` stage and run PlatformIO and repository scripts on it; verify `python3 --version` reports 3.12 and an unmodified klimacontrol `pio run -e adafruit_qtpy_esp32s2` succeeds in the rebuilt image, while the other flavours keep Python 3.11.

## 4. Live-hardware verification

- [x] 4.1 Flash the QT Py ESP32-S2 from a PlatformIO turn using `/dev/qtpy2`; verify the firmware uploads and record whether the `ttyACM` node survives the ROM bootloader re-enumeration.
  - Verified: the firmware built and the upload succeeded once pointed at the bootloader's node. The board re-enumerated as `303a:0002`, not the documented `303a:1001`, so `/dev/qtpy2` disappeared at the uploader's reset and the stable-name upload aborted. The rule now names `303a:0002`; flashing through the transient `/dev/ttyACM0` wrote 1,436,336 bytes and verified the hash, and `/dev/qtpy2` returned as `239a:8111` after the reset. The `ttyACM` minor stayed `0`, so no dynamic-class follow-up is needed; the host's installed rule needs the same `0002` update before a stable-name rerun.
- [x] 4.2 Read live measurements from the JT-UM120 using `/dev/jtum120`; verify the turn opens the `hidraw` node and prints voltage/current samples.
  - Verified: a container running as uid 1001 with `dialout` opened `/dev/jtum120`, read 77 HID reports, and decoded live samples around 5.19 V, 0.08–0.15 W, and 27.5–28.1 °C.
- [x] 4.3 Run an end-to-end turn for the klimacontrol repository with the PlatformIO environment, devices, and `dialout` group; verify the turn sees the devices, builds the firmware, and completes.
  - Verified in the turn container with the configured identity mounts, both devices, and `dialout`: the turn saw both nodes, read the meter, built the firmware, and completed. The unmodified klimacontrol build needs the Python 3.12 runtime added in task 3.4.
- [x] 4.4 Run `npm run verify` and `openspec validate "live-hardware-usb-access" --type change --strict`; verify both pass.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- The hardware spike found that the ESP32-S2 ROM bootloader PID is `303a:0002`; the documented rule uses that ID. The host's installed rule still names `303a:1001` and must be updated to match before a stable-name rerun. Dynamic device-class exposure is not needed on this host because the `ttyACM` minor stayed stable.
- If portability across hosts becomes a requirement, extend the `devices` field with `usb:<vid>:<pid>` selectors as a later change; path entries stay valid.
