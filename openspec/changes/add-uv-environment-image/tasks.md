# Tasks

## 1. Add the uv flavour

- [x] 1.1 Add an intermediate `ghcr.io/astral-sh/uv:<version>` stage and a `FROM base AS uv` stage that copies `uv` into a system path on `PATH`, pins `UV_VERSION` through a build argument, and makes the binary executable by an arbitrary uid; verify `docker build --target uv` against `environments/Dockerfile` succeeds and the image reports `uv --version`
- [x] 1.2 Set the uv cache paths (`UV_CACHE_DIR`, `UV_PYTHON_INSTALL_DIR`, `UV_TOOL_DIR`, `PRE_COMMIT_HOME`) under `/tmp/.uv` and set `UV_LINK_MODE=copy`; verify a container started as a non-root uid can run `uv --version` and write under `/tmp/.uv`
- [x] 1.3 Document the flavour in `environments/README.md` and `docs/configuration.md`, including the flavour table entry, the both-platform publication, and a repository example with a `/tmp/.uv` cache volume; verify every documented path and image name matches the Dockerfile stage
- [x] 1.4 Extend `src/runtime/opencode/environments.test.ts` to assert the `uv` stage, its cache paths, its both-platform publication, and that no other flavour carries `uv`; verify the targeted test file passes

## 2. Integration verification

- [x] 2.1 Run `npm run verify` and confirm the format check, lint, typecheck, unit and integration tests, and OpenSpec validation all pass
- [ ] 2.2 Open a pull request and confirm the environment workflow builds the `uv` target on the native platform without pushing an image

## Workflow follow-up

- After the change lands, verify the default-branch workflow publishes `ghcr.io/wuan/simple-orchestrator/uv` for `linux/amd64` and `linux/arm64` with its `sdk-<version>` tag.
- Archive the change after the project's review requirements are satisfied.
