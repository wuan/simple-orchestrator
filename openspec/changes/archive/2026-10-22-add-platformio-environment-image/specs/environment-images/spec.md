# Spec Delta

## ADDED Requirements

### Requirement: The PlatformIO flavour provides PlatformIO Core

The `platformio` turn environment flavour SHALL install PlatformIO Core, so a
`pio` build or test runs in a turn without installing a toolchain, and SHALL
expose PlatformIO's core directory at a stable path, so a mounted cache volume
keeps the platforms, toolchains, and libraries `pio` downloads between turns.

#### Scenario: A firmware build runs in a turn

- **WHEN** a PlatformIO turn runs the repository's `pio run` for a board
- **THEN** the build finds PlatformIO Core, resolves the platform and toolchain its `platformio.ini` declares, and builds the firmware without installing PlatformIO

#### Scenario: A downloaded platform is reused across turns

- **WHEN** a turn downloads a platform, toolchain, or library and the repository mounts a cache volume at PlatformIO's core directory
- **THEN** a later turn reuses the download instead of fetching it again

#### Scenario: An unprivileged turn can run PlatformIO

- **WHEN** the turn runs as the orchestrator's uid/gid
- **THEN** PlatformIO Core is readable and executable and the core directory is writable

#### Scenario: The PlatformIO flavour publishes both supported platforms

- **WHEN** the `platformio` flavour is published
- **THEN** it carries a `linux/amd64` and a `linux/arm64` image, because PlatformIO publishes the `espressif32` tool packages for `aarch64` and `x86_64`

#### Scenario: The PlatformIO toolchain stays in the PlatformIO flavour

- **WHEN** a flavour other than `platformio` is built
- **THEN** it does not carry PlatformIO Core or its extra tools, so the shared contract and the other flavours are unchanged

### Requirement: The PlatformIO flavour provides the repository's test and gate tools

The `platformio` turn environment flavour SHALL install the coverage tooling an
embedded repository's test report uses and the pinned formatting and lint tools
its commit gate expects, so a turn runs those checks before it commits without
installing them.

#### Scenario: The native tests build and run

- **WHEN** a PlatformIO turn runs the repository's `pio test -e native`
- **THEN** the tests compile with the shared base's host C/C++ compiler and run, and the coverage report the repository generates resolves the coverage tooling the image provides

#### Scenario: The formatting and lint checks run

- **WHEN** a PlatformIO turn runs the repository's formatting and lint checks
- **THEN** the image provides the pinned `clang-format` and `shellcheck` the repository's gate expects, so the checks run without installing them
