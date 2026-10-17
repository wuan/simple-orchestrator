# Tasks

## 1. Add the provider operation

- [x] 1.1 Add `markPullRequestReady(pullRequest: PullRequestRef)` to
      `RepoProvider` and implement it in `FakeProvider` by clearing the stored
      pull request's draft flag, and verify a fake-provider unit test asserts the
      pull request becomes non-draft
- [x] 1.2 Add the operation to the shared provider contract and verify it passes
      for the fake and for GitHub through the in-memory emulator

## 2. Implement it for GitHub over GraphQL

- [x] 2.1 Carry the pull request `node_id` in the GitHub pull payload so the
      provider can address the mutation, and verify the mapping unit tests cover
      it
- [x] 2.2 Add a `graphql` operation to `GitHubTransport`; implement it in
      `GitHubRest` (POST `/graphql`) and `GhCliTransport` (`gh api graphql`), and
      verify command-recording tests cover the request and still keep the secret
      out of argv
- [x] 2.3 Resolve the node id and call `markPullRequestReadyForReview` in
      `GitHubProvider.markPullRequestReady`, add a `/graphql` route to the
      in-memory GitHub emulator, and verify a provider test asserts the pull
      request leaves draft

## 3. Release after a successful apply

- [x] 3.1 Mark the pull request ready in `WorkflowEngine.runTurn` after a
      successful apply turn (the change implemented and archived, and the
      commits published), and verify an engine test asserts the draft pull
      request becomes ready and the phase becomes `implementing`
- [x] 3.2 Verify a failed release marks the workflow failed and posts the error,
      and verify an engine test covers it

## 4. Documentation and verification

- [x] 4.1 Document the ready-for-review transition in the README and verify the
      described flow matches the code
- [x] 4.2 Run `npm run verify` on Node 24 and verify format, lint, typecheck,
      tests, and OpenSpec validation all pass

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result and that the added and modified capability
  requirements appear in the main specs.
