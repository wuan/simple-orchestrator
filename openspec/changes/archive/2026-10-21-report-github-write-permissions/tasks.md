# Tasks

## 1. Permission report

- [x] 1.1 In `src/provider/github/gh-cli.ts`, when a non-GET `gh api` call to
      `/repos/{owner}/{repo}/...` fails with 403 or 404, run
      `gh api --include /repos/{owner}/{repo}` with the same credential and
      append a summary of its permissions and token scopes to the error,
      keeping the original message and status.
- [x] 1.2 Cover no push access, a missing `repo` scope, a classic token that
      may already write, a fine-grained token, an invisible repository, a
      failed check, and the skipped cases in
      `src/provider/github/gh-cli.test.ts`.

## 2. Verification

- [x] 2.1 Run `npm run verify` and confirm it passes.
