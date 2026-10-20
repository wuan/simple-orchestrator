# Spec Delta

## ADDED Requirements

### Requirement: The Rust flavour provides the native build dependencies Rust turns need

The `rust` turn environment flavour SHALL install the native development packages a Rust repository's dependency tree needs, including the OpenSSL development headers and library (`libssl-dev`), so a crate that links the system OpenSSL compiles inside a turn instead of failing on a missing header.

#### Scenario: A crate that links system OpenSSL builds

- **WHEN** a Rust turn builds a dependency tree that links the system OpenSSL
- **THEN** the `rust` image provides the OpenSSL development headers and library and the build succeeds without installing extra packages

#### Scenario: The extra package stays in the Rust flavour

- **WHEN** a flavour other than `rust` is built
- **THEN** it does not carry the OpenSSL development package, so the shared contract and the `node` flavour are unchanged
