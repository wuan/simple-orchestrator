# Tasks

## 1. Add the Android SDK flavour

- [ ] 1.1 In `environments/Dockerfile`, add a `FROM base AS android` stage that installs `openjdk-17-jdk`, `unzip`, and `curl`, downloads the pinned Linux Android command-line tools build, installs `platform-tools`, an SDK platform, and build tools through `sdkmanager`, and accepts the SDK licences; verify with `docker build --build-arg OPENCODE_SDK_VERSION=$(jq -r '.packages["node_modules/@opencode/sdk"].version' package-lock.json) --target android -t ghcr.io/wuan/simple-orchestrator/android:local environments` followed by `docker run --rm ghcr.io/wuan/simple-orchestrator/android:local sh -c 'java -version && sdkmanager --version && aapt2 version'`.
- [ ] 1.2 In the `android` stage, set `ANDROID_HOME` and `ANDROID_SDK_ROOT` to `/opt/android-sdk`, add `cmdline-tools/latest/bin` and `platform-tools` to `PATH`, and make the JDK and SDK readable, executable, and writable by any uid (`chmod -R a+rwX`), matching the Rust flavour's `/usr/local/cargo` handling; verify `docker run --rm --user 12345:12345 ghcr.io/wuan/simple-orchestrator/android:local sh -c 'sdkmanager --version && touch "$ANDROID_HOME/.write-test"'` succeeds.
- [ ] 1.3 Extend `src/runtime/opencode/environments.test.ts` with an assertion that the `android` stage installs the JDK and the Android SDK and sets `ANDROID_HOME`, and that no other stage does; verify the test fails when the stage or the environment variable is removed.
- [ ] 1.4 Add the `android` flavour to the `environments/README.md` flavour table and prose, including a repository `environment` snippet with a Gradle cache volume; verify `npm run format:check` passes and the table names the JDK and Android SDK.

## 2. Declare the flavour's platforms and derive them in the workflow

- [ ] 2.1 Add a `# platforms: linux/amd64` declaration to the `android` stage and a comment explaining that Google publishes the Linux Android SDK tools for `x86_64` only; verify the declaration sits in the comment block immediately above the stage.
- [ ] 2.2 Update the `flavours` discovery step in `.github/workflows/environments.yml` to emit a matrix of `{flavour, platforms}` objects, reading each stage's `# platforms:` declaration and defaulting to `linux/amd64,linux/arm64`; verify `actionlint` or a local parse of a sample Dockerfile yields the expected JSON with `android` restricted to `linux/amd64`.
- [ ] 2.3 Change the `build` job to a matrix over the discovered objects and set the build's `platforms` from `matrix.platforms`, keeping the pull-request branch on the runner's native `linux/amd64`; verify the YAML parses and a pull request still pushes nothing.
- [ ] 2.4 Extend `src/runtime/opencode/environments.test.ts` to assert the discovery parses `# platforms:`, that the `android` stage declares `linux/amd64`, and that the build reads `matrix.platforms` with a both-platforms default for an undeclared flavour; verify the test fails when the declaration or the default changes.
- [ ] 2.5 Document the `# platforms:` declaration and the `android` flavour's single-platform limit in `environments/README.md`; verify `npm run format:check` passes and the text names `linux/amd64` and the default of both platforms.

## 3. Integration checks

- [ ] 3.1 Run `npm run verify` and confirm the format check, lint, typecheck, unit and integration tests, and OpenSpec validation all pass.
- [ ] 3.2 Build an Android repository in the local `android` image (for example the Gradle wrapper's `assembleDebug` against a minimal app project) and confirm it resolves the JDK, SDK platform, and build tools and produces an artifact without installing a toolchain.
- [ ] 3.3 Confirm `docker buildx build --platform linux/amd64 --target android environments` succeeds and that `--platform linux/amd64,linux/arm64 --target android` is rejected by the workflow's per-flavour platform selection rather than attempted, while `--target node` still builds both platforms.

## Workflow follow-up

- After the change lands on the default branch, confirm `ghcr.io/wuan/simple-orchestrator/android:latest` is a `linux/amd64` image and that `node` and `rust` are still multi-platform.
- Archive the change after the project's review requirements are satisfied.
