# Tasks

## 1. Add the PlatformIO flavour

- [ ] 1.1 In `environments/Dockerfile`, add a `FROM base AS platformio` stage
      that installs `python3-venv`, `lcov`, and `shellcheck`, creates a virtual
      environment at `/opt/platformio`, installs the pinned `platformio`,
      `clang-format`, and `pre-commit` into it, sets
      `PLATFORMIO_CORE_DIR=/tmp/.platformio` and `/opt/platformio/bin` on `PATH`,
      and makes the environment readable and executable by any uid
      (`chmod -R a+rwX`); verify with `docker build --build-arg
      OPENCODE_SDK_VERSION=$(jq -r
      '.packages["node_modules/@opencode/sdk"].version' package-lock.json)
      --target platformio -t
      ghcr.io/wuan/simple-orchestrator/platformio:local environments` followed
      by `docker run --rm ghcr.io/wuan/simple-orchestrator/platformio:local sh
      -c 'pio --version && clang-format --version && shellcheck --version &&
      lcov --version'`.
- [ ] 1.2 In the `platformio` stage, pin PlatformIO Core and `clang-format` as
      `ARG`s with defaults (`PLATFORMIO_VERSION`, `CLANG_FORMAT_VERSION`) and add
      a comment that the stage inherits both supported platforms because
      PlatformIO publishes its `espressif32` tools for `linux_aarch64`; verify
      `docker run --rm --user 12345:12345
      ghcr.io/wuan/simple-orchestrator/platformio:local sh -c 'pio --version &&
      touch "$PLATFORMIO_CORE_DIR/.write-test"'` succeeds.
- [ ] 1.3 Extend `src/runtime/opencode/environments.test.ts` with an assertion
      that the `platformio` stage installs PlatformIO Core, sets
      `PLATFORMIO_CORE_DIR` and the virtual environment on `PATH`, and that the
      shared base and the `node`, `rust`, and `android` stages do not carry
      PlatformIO; verify the test fails when the stage or the environment
      variable is removed.
- [ ] 1.4 Add the `platformio` flavour to the `environments/README.md` flavour
      table and prose, including a repository `environment` snippet with a
      `/tmp/.platformio` cache volume; verify `npm run format:check` passes and
      the table names PlatformIO Core.
- [ ] 1.5 Name the PlatformIO toolchain among the container toolchains in
      `docs/configuration.md`; verify `npm run format:check` passes.

## 2. Integration checks

- [ ] 2.1 Run `npm run verify` and confirm the format check, lint, typecheck,
      unit and integration tests, and OpenSpec validation all pass.
- [ ] 2.2 Build a PlatformIO repository in the local `platformio` image (for
      example `wuan/klimacontrol`'s `pio test -e native` and `pio run -e
      adafruit_qtpy_esp32s2`) and confirm it resolves PlatformIO, compiles the
      native tests with coverage, and builds the firmware without installing a
      toolchain; a second run with the same `/tmp/.platformio` volume reuses the
      download instead of fetching it again.
- [ ] 2.3 Confirm `docker buildx build --platform linux/amd64,linux/arm64
      --target platformio environments` is accepted (the stage declares no
      `# platforms:` line) while `--target android` still restricts to
      `linux/amd64`.

## Workflow follow-up

- After the change lands on the default branch, confirm
  `ghcr.io/wuan/simple-orchestrator/platformio:latest` is a two-platform index
  and that `node`, `rust`, and `android` are unchanged.
- Archive the change after the project's review requirements are satisfied.
