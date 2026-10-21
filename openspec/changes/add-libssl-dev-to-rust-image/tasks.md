# Tasks

## 1. Add the package and keep code, docs, and the test in step

- [ ] 1.1 In `environments/Dockerfile`, add `libssl-dev` to the `rust` stage's
      `apt-get install` list and correct the comment that claims no OpenSSL
      development package is needed; verify the stage installs it with
      `docker build --build-arg OPENCODE_SDK_VERSION=$(jq -r
      '.packages["node_modules/@opencode/sdk"].version' package-lock.json)
      --target rust -t ghcr.io/wuan/simple-orchestrator/rust:local environments`
      followed by `docker run --rm ghcr.io/wuan/simple-orchestrator/rust:local
      dpkg -s libssl-dev`.
- [ ] 1.2 Update the `environments/README.md` flavour table and Rust-flavour
      prose to list `libssl-dev` as a native build dependency; verify the table
      row and the prose both name it.
- [ ] 1.3 Extend `src/runtime/opencode/environments.test.ts` to assert the
      `rust` stage installs `libssl-dev`; verify the test fails when the package
      is removed from the Dockerfile and passes otherwise.

## 2. Integration checks

- [ ] 2.1 Run `npm run verify` and confirm the format check, lint, typecheck,
      unit and integration tests, and OpenSpec validation all pass.
- [ ] 2.2 Build the `rust` flavour locally for both published platforms
      (`docker buildx build --platform linux/amd64,linux/arm64
      --build-arg OPENCODE_SDK_VERSION=... --target rust environments`) and
      confirm the multi-platform build succeeds with the added package.
- [ ] 2.3 Reproduce the reported failure against the image: run the affected
      crate's dependency build in the local `rust` image (clone
      `wuan/mqtt-gateway` and run `cargo build` inside the container, or the
      same build against a crate that depends on `openssl-sys`) and confirm it
      compiles now and failed before the package was added.

## Workflow follow-up

- After the change lands on the default branch, confirm the published
  `ghcr.io/wuan/simple-orchestrator/rust:latest` image contains `libssl-dev`.
- Archive the change after the project's review requirements are satisfied.
