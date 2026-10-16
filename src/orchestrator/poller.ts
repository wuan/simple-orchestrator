import type { WorkflowAction } from './decision.js';
import { WorkflowEngine, type WorkflowEngineOptions } from './engine.js';
import { lifecycleLabels } from './labels.js';

export type PollerOptions = WorkflowEngineOptions;

export interface PollReport {
  started: number[];
  actions: { pullRequest: number; kind: WorkflowAction['kind'] }[];
}

/**
 * One poll cycle: discover labeled issues without an active pull request and
 * start them, then drive every in-flight workflow (found by lifecycle label, so
 * discovery works after a restart with no local state).
 */
export class Poller {
  private readonly engine: WorkflowEngine;
  private readonly options: PollerOptions;

  constructor(options: PollerOptions) {
    this.options = options;
    this.engine = new WorkflowEngine(options);
  }

  async pollOnce(): Promise<PollReport> {
    const { provider, labels } = this.options;
    const log = this.options.logger ?? (() => {});
    const repoId = `${provider.id}:${provider.repo.owner}/${provider.repo.name}`;
    const report: PollReport = { started: [], actions: [] };

    log(`polling ${repoId}`);
    const issues = await provider.listTriggerIssues(labels.trigger);
    log(
      issues.length === 0
        ? `${repoId}: no issues with the trigger label '${labels.trigger}'`
        : `${repoId}: discovered issue(s) ${issues.map((issue) => `#${issue.ref.number}`).join(', ')}`,
    );
    for (const issue of issues) {
      const existing = await provider.listPullRequestsForIssue(issue.ref);
      if (existing.some((pullRequest) => pullRequest.state === 'open')) {
        log(`${repoId}: issue #${issue.ref.number} already has an open pull request`);
        continue;
      }
      const result = await this.engine.start(issue);
      if (result.started) {
        report.started.push(issue.ref.number);
        log(
          `${repoId}: started workflow for issue #${issue.ref.number} (PR #${result.pullRequest?.ref.number ?? '?'})`,
        );
      }
    }

    const seen = new Set<number>();
    for (const label of lifecycleLabels(labels)) {
      const pullRequests = await provider.listPullRequestsWithLabel(label);
      for (const pullRequest of pullRequests) {
        if (seen.has(pullRequest.ref.number)) continue;
        seen.add(pullRequest.ref.number);
        const action = await this.engine.drive(pullRequest);
        report.actions.push({ pullRequest: pullRequest.ref.number, kind: action.kind });
        const reason = 'reason' in action ? ` (${action.reason})` : '';
        log(`${repoId}: PR #${pullRequest.ref.number} -> ${action.kind}${reason}`);
      }
    }

    log(`${repoId}: polled, started ${report.started.length}, actions ${report.actions.length}`);
    return report;
  }
}
