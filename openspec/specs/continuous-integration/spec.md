# continuous-integration Specification

## Purpose
Keeps the CI verify job's test execution and reporting singular: the project's
verification gate runs the test suite once, publishes one test report, and emits
the coverage data the code-analysis step consumes.

## Requirements

### Requirement: The verify job runs the test suite once

The CI verify job SHALL execute the project's test suite exactly once per run
and SHALL show exactly one test report entry in the job summary, so the summary
does not repeat the same report.

#### Scenario: The gate runs the suite once

- **WHEN** the CI verify job runs the project's verification gate
- **THEN** Vitest performs a single test run, with no separate coverage run

#### Scenario: One report in the job summary

- **WHEN** the single test run finishes
- **THEN** the job summary contains exactly one "Vitest Test Report" entry

### Requirement: Coverage collection does not add a test run

The verification gate SHALL collect coverage only when the environment requests
it, and that coverage SHALL come from the run that already exercises the test
suite, so coverage never adds a second test run.

#### Scenario: The analysis step gets coverage

- **WHEN** the CI verify job runs with coverage requested
- **THEN** the test run writes `coverage/lcov.info` before the analysis step

#### Scenario: The local gate stays coverage-free

- **WHEN** the verification gate runs with coverage not requested, as by default
- **THEN** the test run does not collect coverage and the gate stays fast
