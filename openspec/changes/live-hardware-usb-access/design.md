# Design

## Context

See `proposal.md` for motivation and the spec deltas for the behavior contract.

Today `buildDockerRunArgs` (`src/runtime/sandbox.ts`) emits a minimal `docker
run`: the store, worktree, runner, and cache volumes, `--network`, `--user`,
`--env`, and `--workdir`. `EnvironmentSpec` (`src/config/types.ts`) carries
`image`, `network`, `pull`, `env`, `gitIdentity`, and `caches`; nothing reaches
the container's `/dev` beyond Docker's default set. The container runs as the
orchestrator's uid/gid, but Docker does not copy the host's supplementary
groups into it.

The two target devices behave differently:

```
QT Py ESP32-S2                         JT-UM120 / FNB58
239a:8111 firmware CDC                 2e3c:5558 composite
  -> /dev/ttyACM* (major 166)            +-- CDC interfaces -> /dev/ttyACM*
303a:0002 ROM USB OTG bootloader        +-- HID interface  -> /dev/hidraw* (major 241)
  -> /dev/ttyACM* (re-enumerates)        measurement protocol is HID
```

The meter's CDC port is not the measurement path, so the meter's config names
its `hidraw` node, not a `ttyACM` node. `--device` is a Linux facility; Docker
Desktop on macOS runs containers in a VM without the host's device tree.

## Goals / Non-Goals

**Goals:**

- Let a repository name stable host device paths and supplementary groups in its
  `environment` block.
- Expose only those devices to the turn's container, with no privileged mode and
  no host `/dev` mount.
- Check the paths at turn start and fail clearly when the hardware is missing.
- Keep the PlatformIO image useful for hardware turns without making device
  access part of the image contract.

**Non-Goals:**

- Resolving devices by USB VID/PID. Selectors (option B) are a possible later
  extension of the same `devices` field, not part of this change.
- Following a device that re-enumerates *during* a turn. That needs dynamic class
  exposure (mounting `/dev` and permitting device-cgroup majors), which is a
  separate change.
- Non-USB devices (GPIO, PCI, cameras) or a generic device-passthrough model.
- A host-side hardware broker or USB/IP support.
- Managing the host's udev rules from the orchestrator.
- Read-only device permissions, per-device credentials, or exclusive device
  locking between concurrent turns.
- Changing the embedded (in-process) runtime.

## Decisions

### 1. Stable host paths plus udev symlinks (option A)

Config entries are absolute host paths:

```yaml
environment:
  image: ghcr.io/wuan/simple-orchestrator/platformio
  devices:
    - /dev/qtpy2
    - /dev/jtum120
  groups:
    - dialout
```

Rationale: the orchestrator stays a thin pass-through. It only has to validate
the paths and add `--device`; it does not need a sysfs walker, selector parser,
interface mapping, or fake-sysfs test fixtures. The host owns device naming with
a few udev rules, which the hardware host needs anyway for permissions.

Alternatives considered:

- **USB selectors (option B)** — portable config across Linux hosts and no
  stable-name rules, but adds a per-turn sysfs resolver and more failure modes.
  Not worth it for a single-tenant orchestrator on one hardware host. The
  `devices` field can accept `usb:` selectors later without breaking path users.
- **Dynamic class exposure (option C)** — mounting `/dev` and permitting whole
  device classes would follow re-enumeration, but it widens the container's
  device view. Kept as a follow-up if the hardware spike shows the bootloader
  transition breaks a fixed node.
- **Host hardware broker (option D)** — strongest isolation, but adds a service
  to run, secure, and version. Out of scope.

### 2. Host udev rules provide stable names and access

The host creates stable names for the three relevant device identities:

```udev
SUBSYSTEM=="tty", ATTRS{idVendor}=="239a", ATTRS{idProduct}=="8111", SYMLINK+="qtpy2", GROUP="dialout", MODE="0660"
SUBSYSTEM=="tty", ATTRS{idVendor}=="303a", ATTRS{idProduct}=="0002", SYMLINK+="qtpy2", GROUP="dialout", MODE="0660"
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="2e3c", ATTRS{idProduct}=="5558", SYMLINK+="jtum120", GROUP="dialout", MODE="0660"
```

The QT Py firmware and ROM bootloader share the `qtpy2` name because only one is
present at a time. The ESP32-S2 ROM bootloader is USB OTG `303a:0002`; the
`303a:1001` ID belongs to ESP32-S3/C3-class USB-Serial/JTAG units, so naming it
would not keep this board's stable link through an upload reset. The meter gets
its own name so its `hidraw` node does not need to be distinguished from any
`ttyACM` node it also creates. `TAG+="uaccess"` is deliberately not used: it
grants a host ACL to the logged-in user and does not cross into the container.
`GROUP`/`MODE` plus the orchestrator's `--group-add` is what makes the
container's non-root user able to open the node.

### 3. Groups are resolved on the host

`groups` accepts names or numeric gids. A name is resolved to the host's gid
(for example with `getent group` or `/etc/group`) and passed as a numeric gid to
Docker. Passing the name straight through would resolve in the image's
`/etc/group`, which can differ from the host's and silently put the turn in the
wrong group. `--device` nodes are owned by the host's uid/gid, so this is what
makes the non-root turn able to open them.

### 4. Check each path at turn start

Before `docker run`, the orchestrator checks every configured path:

- it must be absolute (also enforced at config load);
- it must exist after following symlinks;
- it must be a character device.

A failure names the configured path and fails the turn before the container
starts. Docker would eventually fail on a missing `--device`, but its error is
less direct and arrives after the pull/start work. A hardware turn that starts
without its hardware wastes a full agent turn and produces confusing tool
errors.

Checking per turn means a stable name is re-resolved each time. A device
replugged between turns is found at its new target; a dangling symlink fails
with the configured path in the message.

### 5. Fixed device nodes for the turn

Paths are passed with `--device <path>:<path>`, defaulting to `rwm`. Flashing
needs write access (reset and control lines); the meter's protocol also writes
init and keepalive reports, so read-only is not the default. No `--privileged`
and no `/dev` mount are introduced; an environment that configures no devices
keeps exactly the previous container.

Docker resolves the symlink when the container is created and creates a device
node at the configured path inside the container. That is why the container can
open `/dev/qtpy2` even though the host's symlink points at `/dev/ttyACM0`.

The trade-off is the mid-turn re-enumeration limitation described under Risks.

### 6. PlatformIO image tooling stays in the flavour

Add `usbutils` (for `lsusb`), `libudev1`, and `libusb-1.0-0` to the `platformio`
stage only. `usbutils` makes device visibility debuggable from inside the turn;
the libraries let a HID client (hidapi-based) enumerate and open the meter.
Other flavours keep their current package sets.

### 7. Device access stays opt-in

An environment only gets devices when it names them. There is no global device
passthrough, no privileged container, and no `/dev` bind mount. The meter's write
capability is accepted because its protocol needs init/keepalive reports, but it
is documented as a real hardware action.

### 8. PlatformIO runs on Python 3.12

The `platformio` flavour ships Python 3.12 for PlatformIO and the repository's
pre/post scripts. Debian bookworm's system Python is 3.11, and klimacontrol's
`compress_web.py` uses an f-string backslash that only 3.12 accepts, so an
unmodified klimacontrol build fails before it reaches the hardware. The image
copies the official Python 3.12 build into `/opt/python312`, installs the runtime
libraries it needs, and creates PlatformIO's virtual environment with that
interpreter; the shared base and the other flavours keep their system Python.
The alternative of using the `uv` flavour's binary would make `uv` part of the
PlatformIO image and break the rule that the Python toolchain stays in `uv`.

### 9. PlatformIO uploads through the stable port

PlatformIO's esptool uploader resets the board and then looks for a new
`/dev/tty*` node, but the turn container exposes only the configured stable
alias, which pyserial does not enumerate as a new port. A repository that flashes
through `qtpy2` therefore sets `board_upload.wait_for_upload_port = false` and
uses `/dev/qtpy2` as its upload port. The hardware spike verified this path;
without the setting the uploader aborts after the reset even though the alias
resolves correctly.

## Risks / Trade-offs

- **ESP32 bootloader re-enumeration mid-turn** → Docker fixes the device node at
  container creation. The ROM bootloader enumerates as `303a:0002`; if it
  receives a different `ttyACM` minor, the flash fails even though `/dev/qtpy2`
  resolved correctly before the turn. Mitigation: the hardware spike flashes the
  board from a container and records whether the node stays usable; it observed
  the same `ttyACM` minor through the reset. If a host assigns a different minor,
  the follow-up is dynamic class exposure (option C); this change's specs
  deliberately do not promise mid-turn re-enumeration.
- **PlatformIO port rescan after reset** → the uploader waits for a new
  `/dev/tty*` node, but the container exposes only the stable alias. Mitigation:
  the documented `board_upload.wait_for_upload_port = false` setting keeps
  `/dev/qtpy2` as the upload port; the hardware spike verified the upload.
- **Symlink target changes between the check and container creation** → the
  device could be unplugged after the pre-check. Mitigation: Docker fails to
  create the device and the turn fails; the window is small and the failure is
  clear.
- **hidraw permissions** → the meter's hidraw node is root-only by default.
  Mitigation: documented udev rules set `GROUP`/`MODE`, and the configured group
  is resolved on the host and added to the container process.
- **ModemManager grabs the ESP32 CDC port** → enumeration or flashing can hang.
  Mitigation: documented `ID_MM_DEVICE_IGNORE` rule for the ESP32 USB IDs.
- **Symlink collision** → if two devices with the same udev rule appear at once
  (for example two QT Py boards), udev points the name at one of them. The
  single-device workflow is unaffected; multiple identical boards are out of
  scope.
- **Host-specific config** → `/dev/qtpy2` depends on the host's udev rules.
  Mitigation: the rules and names are documented as deployment prerequisites;
  moving hosts means applying the same rules.
- **Device contention** → the poller drives turns sequentially, but one turn can
  hold the hardware for `limits.maxDurationMs` (30 minutes by default). No
  locking is added; concurrent workflows on the same repository would still be
  serialized by the orchestrator.
- **Trust boundary** → a turn can reset a board, reflash firmware, or send
  charge-protocol trigger commands. Mitigation: access is opt-in per repository,
  no privileged container, and the meter's write capability is documented as
  potentially damaging equipment.
- **Host portability** → `--device` is Linux-only. Mitigation: fail with a clear
  message on macOS and document USB/IP as the alternative.

## Migration Plan

- The configuration is additive: repositories without `environment.devices`
  behave exactly as before, so no migration is required.
- Ship the pass-through and image tooling first, then add the example to
  `docs/configuration.md` and the udev prerequisites to
  `environments/README.md`.
- Host setup is a documented manual step (udev rules, optional ModemManager
  exclusion); the orchestrator does not edit host policy.
- Rollback is removing the device fields or reverting to the previous image tag;
  no data or config migration is involved.
- If portability becomes a requirement later, add `usb:` selector entries to the
  same `devices` field; existing path entries remain valid.

## Open Questions

- Should a later change add per-device permissions (for example a read-only
  meter mode)? Deferrable; this change keeps `rwm` because both target workflows
  need write access.
