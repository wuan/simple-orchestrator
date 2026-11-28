# Proposal

## Why

Containerized turns currently see only Docker's minimal `/dev`: `buildDockerRunArgs` emits no `--device` or `--group-add`, and `EnvironmentSpec` has no field for device access. A repository that drives live hardware — an ESP32-S2 board being flashed and a USB power meter being read — therefore cannot use its toolchain container for the work it exists to do. The PlatformIO flavour needs a way to reach attached USB devices directly, without falling back to an in-process turn or a privileged container.

## What Changes

- Add declarative device access to a repository's `environment` block: `devices` lists host device paths, and `groups` names supplementary groups the turn's process joins so a non-root turn can open the nodes.
- Pass each device path into the container with Docker's device mapping, and each group as a supplementary group.
- Check each configured device path when a turn starts and fail the turn with a clear error naming the path when it is absent or is not a character device.
- Document the host-side prerequisites: udev rules that set group ownership and stable device names (`SYMLINK`), plus keeping ModemManager off the ESP32 CDC ports. The ESP32-S2's ROM bootloader is named as `303a:0002` so `qtpy2` survives the uploader's reset.
- Add the container-side tooling a hardware turn needs (`usbutils`, and the `libudev`/`libusb` runtime for HID clients) to the PlatformIO flavour.
- Ship Python 3.12 in the PlatformIO flavour so the target repository's pre/post scripts run; Debian bookworm's system Python is 3.11 and klimacontrol's `compress_web.py` needs 3.12.
- Leave device access out of the image itself: images stay hardware-agnostic; the repository's environment block names the devices.

This change uses stable host paths (option A). Resolving devices by USB VID/PID is a possible later extension of the same `devices` field; it is not part of this change. Following a device that re-enumerates *during* a turn is also out of scope and is covered by a hardware verification task.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `orchestrator-configuration`: the `environment` block gains device-path and group fields, with fail-fast validation and documented defaults.
- `agent-runtime`: containerized turns can receive configured host devices and supplementary groups under the existing least-privilege model, and fail clearly when a device is unavailable.
- `environment-images`: the `platformio` flavour gains the USB debugging and HID runtime packages a live-hardware turn needs, runs the repository's pre/post scripts on Python 3.12, and the documentation explains the udev prerequisites.

## Impact

- `src/config/types.ts` and the config loader/validator: new `environment.devices`/`environment.groups` fields.
- `src/runtime/sandbox.ts` and `src/runtime/opencode/container-client.ts`: new `--device`/`--group-add` arguments and the turn-start device check.
- `environments/Dockerfile` and `environments/README.md`: PlatformIO image packages, its Python 3.12 runtime, and hardware documentation.
- `docs/configuration.md`: the new `environment` fields.
- Linux hosts only for direct device mapping; Docker Desktop on macOS runs containers in a VM. This is recorded as an open decision in `design.md`.
- Device access is a real trust boundary: a turn can reset a board or send charge-protocol commands to the meter, so the feature is opt-in per repository and never enabled for every environment.
