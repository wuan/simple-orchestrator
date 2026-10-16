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
    const report: PollReport = { started: [], actions: [] };

    const issues = await provider.listTriggerIssues(labels.trigger);
    for (const issue of issues) {
      const existing = await provider.listPullRequestsForIssue(issue.ref);
      if (existing.some((pullRequest) => pullRequest.state === 'open')) continue;
      const result = await this.engine.start(issue);
      if (result.started) report.started.push(issue.ref.number);
    }

    const seen = new Set<number>();
    for (const label of lifecycleLabels(labels)) {
      const pullRequests = await provider.listPullRequestsWithLabel(label);
      for (const pullRequest of pullRequests) {
        if (seen.has(pullRequest.ref.number)) continue;
        seen.add(pullRequest.ref.number);
        const action = await this.engine.drive(pullRequest);
        report.actions.push({ pullRequest: pullRequest.ref.number, kind: action.kind });
      }
    }

    return report;
  }
}
