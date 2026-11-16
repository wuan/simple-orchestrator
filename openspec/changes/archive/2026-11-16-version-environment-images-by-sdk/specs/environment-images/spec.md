# Spec Delta

## ADDED Requirements

### Requirement: Images are tagged with the SDK version they install

Every published environment image SHALL carry an SDK-version tag
(`sdk-<version>`) naming the `@opencode/sdk` version baked into it, alongside
its existing tags, so an orchestrator can pull an image by the compatibility
contract it checks at turn start.

#### Scenario: An image build publishes its SDK tag

- **WHEN** the workflow builds a flavour with `@opencode/sdk` version `X`
- **THEN** it publishes that flavour under `sdk-X`, in addition to `latest` and its commit tags

#### Scenario: The SDK tag names the installed version

- **WHEN** an image pulled by its `sdk-X` tag reports its installed SDK version
- **THEN** the reported version is `X`

#### Scenario: Pull requests do not publish SDK tags

- **WHEN** a pull request builds an environment image
- **THEN** no `sdk-*` tag is pushed to the registry

### Requirement: Documentation pairs images with an SDK version

The environment image documentation SHALL present the SDK-version tag (or an
untagged reference the orchestrator resolves to it) as the supported way to
pair an image with a checkout, and SHALL state that `latest` moves with the
default branch and can carry an SDK the running orchestrator does not have.

#### Scenario: The documented example pairs image and checkout

- **WHEN** an operator reads the image documentation's configuration example
- **THEN** it does not pin `latest`, and it explains how the image follows the orchestrator's SDK version

#### Scenario: The movable tag is called out

- **WHEN** an operator reads about `latest`
- **THEN** the documentation states that it follows the default branch and is not safe to pair with a checkout that may lag behind
