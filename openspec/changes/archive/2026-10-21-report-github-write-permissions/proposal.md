# Proposal

## Why

When the GitHub credential configured for a repository can read it but not
write to it, GitHub refuses the write with `404 Not Found` (sometimes `403`)
rather than naming the missing permission. On a public repository every read
still succeeds, so the orchestrator discovers issues and then fails opening the
draft pull request with a bare
`gh api POST /repos/wuan/mqtt-gateway/git/commits failed: gh: Not Found (HTTP 404)`,
which reads like a missing repository or object rather than a credential
problem.

## What Changes

- When a write through the `gh` CLI transport to a repository endpoint fails
  with 403 or 404, the transport SHALL ask `gh` what the same credential may do
  on that repository and append the result to the error: the account's
  repository permissions, a classic token's scopes, and a hint at the likely
  cause (no push access, a missing `repo` scope, or a fine-grained token or
  GitHub App without write access).
- The check is best effort: the original error and its status are kept, and a
  failed check is reported as such.
- Reads and other failures are unchanged and trigger no extra request.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `repo-provider`: the GitHub provider explains a refused write in terms of the
  credential's permissions on the repository.

## Impact

- `src/provider/github/gh-cli.ts` - the permission check on refused writes.
- `src/provider/github/gh-cli.test.ts` - coverage for each report and for the
  cases that skip the check.
- No configuration change; one extra `gh api` call only when a write fails.
