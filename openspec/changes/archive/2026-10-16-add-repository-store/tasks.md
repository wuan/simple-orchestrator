# Tasks

## 1. Configuration

- [x] 1.1 Add a `workspace` block to the configuration model (`root` and optional `worktrees`) with defaults `~/workspace` and the OS temp directory, and verify loader tests cover the defaults and an override
- [x] 1.2 Expand a leading `~` when resolving workspace paths and verify a path unit test covers `~/x`, `~`, and an absolute path
- [x] 1.3 Document the `workspace` fields and defaults in `docs/configuration.md` and `examples/config.yaml`, and verify the documented example still loads and resolves

## 2. Provider git operations

- [x] 2.1 Add a `full` option to `CloneInput` and a `fetch` operation to the provider interface (`FetchInput`), and verify the fake provider records clone and fetch calls
- [x] 2.2 Implement the full clone and `fetch` in `TokenCloner` and `GhCliCloner` without exposing the token in argv or stored config, and verify command-recording unit tests cover both transports
- [x] 2.3 Extend the provider contract suite with a fetch check and verify it passes against the GitHub adapter

## 3. Repository store and worktree sandbox

- [x] 3.1 Implement `RepositoryStore` (layout `<root>/<owner>/<name>`, clone on first use with the base branch, fetch on reuse, cleanup on clone failure) and verify unit tests cover first use, reuse, and failure
- [x] 3.2 Replace the ephemeral clone sandbox with a worktree sandbox that provisions `git worktree add` from the store per turn and removes it on dispose, and verify an integration test against a local git remote shows distinct workspaces, branch checkout, and cleanup
- [x] 3.3 Verify `buildDockerRunArgs` behavior is unchanged and its unit test still passes

## 4. Wiring, docs, and integration

- [x] 4.1 Wire the store and worktree sandbox into `createService` with the configured workspace paths and the repository's base branch, and verify the service builds a poller per repository
- [x] 4.2 Update the README architecture and notes to describe the repository store plus per-turn worktrees, and verify the described paths match the implementation
- [x] 4.3 Run the full test, lint, and typecheck suite and verify all pass

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result and that the modified capability requirements appear in the main specs.
