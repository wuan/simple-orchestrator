# Spec Delta

## MODIFIED Requirements

### Requirement: Configurable turn environment
The orchestrator SHALL accept an optional `environment` block on a repository entry and in `defaults`, naming a container image and optional network mode, image pull policy, environment variable names, git identity, and cache volumes, and SHALL apply documented defaults when optional fields are omitted.

#### Scenario: Environment image is used
- **WHEN** a repository entry configures an environment image
- **THEN** turns for that repository run in a container of that image

#### Scenario: Entry inherits an environment default
- **WHEN** `defaults` sets an environment image and a repository entry omits it
- **THEN** that entry inherits the default image

#### Scenario: Entry overrides an environment default
- **WHEN** `defaults` sets an environment image and a repository entry sets a different image
- **THEN** that entry uses its own image

#### Scenario: Default image pull policy applies
- **WHEN** neither `defaults` nor a repository entry sets an image pull policy
- **THEN** the documented default policy applies, checking the registry for the image before a turn

#### Scenario: Entry overrides an environment pull policy
- **WHEN** `defaults` sets an image pull policy and a repository entry sets a different one
- **THEN** that entry uses its own policy

#### Scenario: No environment keeps the in-process runtime
- **WHEN** neither `defaults` nor a repository entry sets an environment
- **THEN** that repository's turns run in the in-process runtime

### Requirement: Fail-fast environment validation
The orchestrator SHALL validate the environment block at startup and SHALL stop with a clear error naming the affected repository when its image is missing or a field is invalid.

#### Scenario: Missing image fails startup

- **WHEN** an environment block omits the image
- **THEN** startup fails with an error naming the repository

#### Scenario: Invalid field fails startup
- **WHEN** an environment field has the wrong type or an empty value
- **THEN** startup fails with an error naming the repository

#### Scenario: An unsupported pull policy fails startup
- **WHEN** the environment's pull policy is not one of the documented values
- **THEN** startup fails with an error naming the repository
