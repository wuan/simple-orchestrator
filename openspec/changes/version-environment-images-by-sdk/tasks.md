# Tasks

## 1. Publish SDK-version image tags

- [x] 1.1 Add `type=raw,value=sdk-${{ steps.sdk.outputs.version }}` to the `metadata-action` tags in `.github/workflows/environments.yml`, and update the workflow comments to explain that the tag names the SDK baked into the image; verify the rendered `tags:` block contains the new entry and references the same `steps.sdk.outputs.version` used for the build argument.
- [x] 1.2 Update the "Published images" section of `environments/README.md` to list `sdk-<version>` as a published tag and state that pull requests build without pushing it; verify the section names every tag the workflow emits.

## 2. Resolve untagged image references to the SDK tag

- [x] 2.1 Add an exported `resolveImageReference(image, sdkVersion)` helper in `src/runtime/opencode/container-client.ts`: return `image:sdk-<version>` when no tag is named, and return tagged or digest references unchanged; split on the last `/` before looking for `:` so a registry port is not treated as a tag. Verify with unit tests covering untagged, tagged, digest, and `localhost:5000/agent` references.
- [x] 2.2 Use the helper in `ContainerOpenCodeClient.runSkill` when building the `docker run` arguments, and verify the existing argv test asserts an untagged environment image becomes `ghcr.io/acme/agent-java:sdk-2.0.31`.
- [x] 2.3 Add a client test that an explicitly tagged image is passed verbatim while `expectedSdkVersion` still carries the orchestrator's SDK version; verify the test fails if the helper rewrites a tagged reference.
- [x] 2.4 Run `npm test -- src/runtime/opencode/container-client.test.ts` and verify all resolver and client tests pass.

## 3. Document the tag convention for operators

- [x] 3.1 Update the `environment` section of `docs/configuration.md`: describe that an untagged `image` selects the image for the orchestrator's `@opencode/sdk` version, that an explicit tag or digest is used verbatim, and that `latest` follows the default branch and can carry a different SDK; verify the field table and example prose agree.
- [x] 3.2 Change the project image examples in `environments/README.md` and `README.md` from `:latest` to the untagged project reference or an explicit `sdk-*` tag; verify `src/config/examples.test.ts` remains valid and no project image example still pins `latest`.

## 4. Integration verification

- [x] 4.1 Run `npm run verify` and verify formatting, lint, typecheck, tests, and `openspec validate --strict` pass.
- [x] 4.2 With Docker available, run the container smoke test after `npm run build` and verify it still fails fast on the injected SDK mismatch.

## Workflow follow-up

- After the workflow runs on `main`, pull a flavour by its `sdk-<version>` tag and verify the tag exists for the same SDK version the orchestrator resolves.
- Archive the change after review and a successful publish confirms the `sdk-*` tags.
