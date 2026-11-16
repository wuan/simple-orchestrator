# Spec Delta

## ADDED Requirements

### Requirement: The uv flavour provides uv and its cache paths

The `uv` turn environment flavour SHALL install a pinned `uv` binary, expose it on
`PATH` to an unprivileged turn, and define stable cache paths for the
interpreters, packages, and tools `uv` downloads, so a Python repository runs its
`uv` commands without installing `uv`.

#### Scenario: A Python turn runs uv commands

- **WHEN** a `uv` turn runs `uv sync` or `uv run` against the repository's `pyproject.toml` and `uv.lock`
- **THEN** the image provides `uv` and the command resolves the interpreter and dependencies without installing `uv`

#### Scenario: Downloaded interpreters and packages are reused

- **WHEN** a turn downloads a Python interpreter or package into the flavour's cache paths and the repository mounts a cache volume there
- **THEN** a later turn reuses the download instead of fetching it again

#### Scenario: An unprivileged turn can run uv

- **WHEN** the turn runs as the orchestrator's uid/gid
- **THEN** `uv` is readable and executable and the cache paths are writable

#### Scenario: The uv flavour publishes both supported platforms

- **WHEN** the `uv` flavour is published
- **THEN** it carries a `linux/amd64` and a `linux/arm64` image, because `uv` and the Python builds it installs support both platforms

#### Scenario: The Python toolchain stays in the uv flavour

- **WHEN** a flavour other than `uv` is built
- **THEN** it does not carry `uv`, so the shared contract and the `node`, `rust`, `android`, and `platformio` flavours are unchanged

### Requirement: The uv flavour leaves interpreters and project tooling to the repository

The `uv` turn environment flavour SHALL leave the Python version, dependencies,
and development tools to the repository's `pyproject.toml`, `uv.lock`, and `uv`
commands, so the image does not impose a version or toolchain on a Python
repository.

#### Scenario: The repository's Python version is resolved at turn time

- **WHEN** a repository declares its Python version through `requires-python` or `.python-version`
- **THEN** `uv` selects or downloads a matching interpreter instead of the image fixing one

#### Scenario: Project development tools come from the repository environment

- **WHEN** a turn runs the repository's tests, lint, type check, or commit hooks
- **THEN** it uses the tools and versions the repository declares, not preinstalled image versions
