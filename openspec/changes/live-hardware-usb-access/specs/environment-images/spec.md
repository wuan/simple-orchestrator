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
