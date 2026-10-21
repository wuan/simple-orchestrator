# Spec Delta

## MODIFIED Requirements

### Requirement: Bounded turn cost
The orchestrator SHALL enforce per-turn limits on agent steps, tokens, and wall-clock time by bounding each turn's runtime, and SHALL fail the turn when a limit is exceeded. The token budget SHALL count the tokens of new work - input, output, reasoning, and cache write - and SHALL NOT count cache reads, so the budget bounds what a turn does rather than the context it re-reads.

#### Scenario: Time limit exceeded
- **WHEN** a turn exceeds the configured wall-clock limit
- **THEN** the turn is stopped and reported as a failure

#### Scenario: Step limit exceeded
- **WHEN** a turn exceeds the configured agent-step limit
- **THEN** the turn is stopped and reported as a failure

#### Scenario: Token limit exceeded
- **WHEN** a turn's input, output, reasoning, and cache-write tokens exceed the configured token limit
- **THEN** the turn is stopped and reported as a failure

#### Scenario: Cache reads do not consume the token budget
- **WHEN** a turn re-reads a large, unchanged context and reports most of its tokens as cache reads
- **THEN** the cache reads do not count against the token limit, so the turn is not failed for re-reading its own context

### Requirement: Per-repository network and cache mounts
The orchestrator SHALL apply the environment's configured network mode, defaulting the network to allow provider egress, and SHALL support named-volume mounts for tool caches. Before a turn runs, the orchestrator SHALL make each mounted cache volume writable by the turn's user, so a cache path the image does not provide as writable still persists across turns.

#### Scenario: Network policy applied
- **WHEN** an environment configures a network mode
- **THEN** the container runs with that mode

#### Scenario: Provider egress by default
- **WHEN** an environment omits the network mode
- **THEN** the container can reach the configured model provider

#### Scenario: Cache volume persists across turns
- **WHEN** an environment mounts a named cache volume
- **THEN** successive turns of that repository reuse its contents

#### Scenario: Cache volume is made writable by the turn
- **WHEN** an environment mounts a named cache volume whose path the image does not provide as writable
- **THEN** the orchestrator makes the volume writable by the turn's user before the turn runs, so the turn can populate the cache
