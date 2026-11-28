# Spec Delta

## ADDED Requirements

### Requirement: The PlatformIO flavour provides live-hardware USB tooling

The `platformio` turn environment flavour SHALL install USB inspection tooling
and the runtime libraries a HID client needs, so an unprivileged hardware turn
can list USB devices and open a meter's `hidraw` interface without installing
packages. The tooling SHALL stay in the `platformio` flavour.

#### Scenario: USB devices are inspectable in a turn

- **WHEN** a PlatformIO turn runs `lsusb`
- **THEN** the command runs from the image and lists the devices exposed to the container

#### Scenario: A HID client opens hidraw

- **WHEN** a PlatformIO turn runs a HID client against an exposed `hidraw` interface
- **THEN** the client's runtime libraries resolve from the image and the device opens

#### Scenario: Other flavours remain unchanged

- **WHEN** a flavour other than `platformio` is built
- **THEN** it does not carry the live-hardware USB tooling

### Requirement: The PlatformIO flavour runs repository scripts on Python 3.12

The `platformio` turn environment flavour SHALL run PlatformIO Core and the
repository's pre/post scripts on Python 3.12, so a repository whose scripts use
3.12 language features builds in a turn without installing an interpreter. The
shared base and every other flavour SHALL keep their current Python.

#### Scenario: A 3.12-only pre-script runs

- **WHEN** a PlatformIO turn builds a repository whose pre/post script uses 3.12 language features
- **THEN** the script runs on Python 3.12 and the build proceeds

#### Scenario: PlatformIO Core uses the same interpreter

- **WHEN** a PlatformIO turn runs `pio run`
- **THEN** PlatformIO Core runs on Python 3.12

#### Scenario: The Python runtime stays in the PlatformIO flavour

- **WHEN** a flavour other than `platformio` is built
- **THEN** it does not carry the Python 3.12 runtime

### Requirement: Live-hardware prerequisites are documented

The environment image documentation SHALL describe the host prerequisites for
passing live hardware into a turn: udev rules that set group ownership and stable
device names for the board and meter, keeping ModemManager off firmware CDC
ports, and the limitation that direct device access requires a Linux host while
Docker Desktop on macOS needs USB/IP.

#### Scenario: Operator finds the udev setup

- **WHEN** an operator wants to pass a board and a USB meter into a turn
- **THEN** the environment documentation names the required udev permissions, stable names, and CDC-port exclusion

#### Scenario: Unsupported host is called out

- **WHEN** an operator runs the orchestrator on macOS with Docker Desktop
- **THEN** the documentation states that direct device access is unavailable and names USB/IP as the alternative
