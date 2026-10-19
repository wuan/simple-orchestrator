import {
  DEFAULT_LIMITS,
  type EnvironmentSpec,
  type LabelConfig,
  type Limits,
} from '../config/types.js';
import type {
  NormalizedEvent,
  TranscriptEntry,
  TurnContext,
  TurnResult,
  TurnSkill,
  TurnUsage,
  WorkflowPhase,
} from '../domain/types.js';
import { reviewEvent } from '../provider/normalize.js';
import { isOrchestratorActor, latestHumanReview } from '../provider/reviews.js';
import type {
  ProviderComment,
  ProviderIssue,
  ProviderPullRequest,
  ProviderReview,
  RepoProvider,
  ThreadTarget,
} from '../provider/types.js';
import { LimitExceededError } from '../runtime/limits.js';
import { assertPushAllowed, PermissionError } from '../runtime/policy.js';
import { BaseIntegrationError, type Sandbox, type SandboxHandle } from '../runtime/sandbox.js';
import type { AgentRuntime } from '../runtime/types.js';
import { decide, type WorkflowAction } from './decision.js';
import { allPhaseLabels, issueNumberFromBranch, labelForPhase, phaseFromLabels } from './labels.js';
import { evaluateReadiness, type OpenspecCli } from './readiness.js';
import { conventionalTitle, reconcileConventionalTitle } from './title.js';
import {
  accumulateUsage,
  latestUsage,
  mergeUsage,
  withLastTurnMetrics,
  withTurnMetrics,
} from './usage.js';
import { answeredMarker, answeredWatermark } from './watermark.js';

export interface WorkflowEngineOptions {
  provider: RepoProvider;
  runtime: AgentRuntime;
  sandbox: Sandbox;
  openspec: OpenspecCli;
  labels: LabelConfig;
  baseBranch: string;
  /** Container environment the repository's turns run in; in-process when omitted. */
  environment?: EnvironmentSpec;
  limits?: Limits;
  maxReviseRounds?: number;
  logger?: (message: string) => void;
}

export interface StartResult {
  started: boolean;
  pullRequest?: ProviderPullRequest;
  /**
   * The merged pull request that already resolved the issue, set when it
   * prevented the start. The host may not have closed the issue yet.
   */
  resolvedBy?: ProviderPullRequest;
}

/** A limit or permission failure is permanent; anything else is retried once. */
function isRetryable(error: unknown): boolean {
  return (
    !(error instanceof LimitExceededError) &&
    !(error instanceof PermissionError) &&
    !(error instanceof BaseIntegrationError)
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A propose turn without a review trigger finished without committing anything,
 * so it did no work. It is a failed turn rather than an idle one: leaving the
 * change in `proposing` waits for a review that nothing prompts for.
 */
export class NoProgressError extends Error {
  constructor() {
    super('the propose turn produced no change: nothing was committed to the workflow branch');
    this.name = 'NoProgressError';
  }
}

function buildTranscript(
  reviews: ProviderReview[],
  comments: ProviderComment[],
): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [
    ...reviews.map((review) => ({
      id: `review:${review.id}`,
      origin: 'review' as const,
      author: review.author,
      body: review.body,
      at: review.at,
      reviewState: review.state,
    })),
    ...comments.map((comment) => ({
      id: `comment:${comment.id}`,
      origin: 'comment' as const,
      author: comment.author,
      body: comment.body,
      at: comment.at,
    })),
  ];
  return entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/**
 * The title of a workflow's draft pull request: a Conventional Commit subject
 * deduced from the issue's context (its title or labels) and compacted to the
 * project's commit-subject limit, so the subject the host derives from it on
 * merge follows the project convention. It carries no generated
 * `OpenSpec change for issue #<n>` marker.
 */
function pullRequestTitle(issue: ProviderIssue): string {
  return conventionalTitle({ title: issue.title, labels: issue.labels });
}

/**
 * The body of a workflow's draft pull request: a host-recognized closing
 * reference to the issue, so merging the pull request into the host's default
 * branch links it to the issue and closes it. It does not repeat the issue as a
 * `Workflow for issue #<n>.` description.
 */
function pullRequestBody(issue: ProviderIssue): string {
  return `Closes #${issue.ref.number}`;
}

/** Attach the orchestrator-measured elapsed time and attempt count to usage. */
function withMeasuredUsage(reported: TurnUsage, startedAt: number, attempts: number): TurnUsage {
  return { ...reported, durationMs: Date.now() - startedAt, attempts };
}

/** The heading that opens every turn comment, which identifies the turn's skill. */
function turnHeading(skill: TurnSkill): string {
  return `**OpenSpec ${skill} turn**`;
}

/**
 * The propose turns the orchestrator has posted, recognised by their comment
 * heading. Readiness prompts, failure and lifecycle notices, and apply turns
 * are not propose turns, so they do not use up the revise limit.
 */
function ownProposeTurns(comments: ProviderComment[], botLogin?: string): number {
  return comments.filter(
    (comment) =>
      isOrchestratorActor(comment.author, botLogin) &&
      comment.body.startsWith(turnHeading('propose')),
  ).length;
}

/**
 * The record that the newest feedback was answered: the newest human review
 * the orchestrator's own comments record having read (see `watermark.ts`). Its
 * comments are recognised whether the host flags its account as a bot or it
 * matches the configured bot login.
 */
function answeredAt(comments: ProviderComment[], botLogin?: string): string | null {
  return answeredWatermark(
    comments.filter((comment) => isOrchestratorActor(comment.author, botLogin)),
  );
}

/**
 * Drives a single workflow: it starts work from an issue and, on each poll,
 * performs at most one turn (or a terminal transition) based on the watermark
 * decision. All state is read from the host; the engine holds none.
 */
export class WorkflowEngine {
  private readonly provider: RepoProvider;
  private readonly runtime: AgentRuntime;
  private readonly sandbox: Sandbox;
  private readonly openspec: OpenspecCli;
  private readonly labels: LabelConfig;
  private readonly baseBranch: string;
  private readonly environment: EnvironmentSpec | undefined;
  private readonly limits: Limits;
  private readonly maxReviseRounds: number;
  private readonly logger: (message: string) => void;

  private botLogin: string | undefined;
  private botLoginLoaded = false;

  /** Pull requests this process has already tried to recover (see `recover`). */
  private readonly recovered = new Set<number>();

  constructor(options: WorkflowEngineOptions) {
    this.provider = options.provider;
    this.runtime = options.runtime;
    this.sandbox = options.sandbox;
    this.openspec = options.openspec;
    this.labels = options.labels;
    this.baseBranch = options.baseBranch;
    this.environment = options.environment;
    this.limits = options.limits ?? DEFAULT_LIMITS;
    this.maxReviseRounds = options.maxReviseRounds ?? 3;
    this.logger = options.logger ?? (() => {});
  }

  private target(pullRequest: ProviderPullRequest): ThreadTarget {
    return { kind: 'pull_request', ref: pullRequest.ref };
  }

  private async getBotLogin(): Promise<string | undefined> {
    if (!this.botLoginLoaded) {
      this.botLoginLoaded = true;
      try {
        this.botLogin = (await this.provider.botIdentity()).login;
      } catch {
        this.botLogin = undefined;
      }
    }
    return this.botLogin;
  }

  private async resolveIssue(pullRequest: ProviderPullRequest): Promise<ProviderIssue | null> {
    const number = pullRequest.linkedIssue?.number ?? issueNumberFromBranch(pullRequest.branch);
    if (number === null || number === undefined) return null;
    return this.provider.getIssue({ repo: this.provider.repo, number });
  }

  /** Begin a workflow for a labeled issue: one draft pull request, one propose turn. */
  async start(issue: ProviderIssue): Promise<StartResult> {
    const existing = await this.provider.listPullRequestsForIssue(issue.ref);
    const active = existing.find((pullRequest) => pullRequest.state === 'open');
    if (active !== undefined) return { started: false, pullRequest: active };

    // A merged pull request already implemented this issue's change. The host
    // may not have closed the issue yet, but starting again would duplicate the
    // merged change, so report it and do nothing. A pull request closed without
    // merge is an inactive attempt and does not resolve the issue.
    const merged = existing.find((pullRequest) => pullRequest.state === 'merged');
    if (merged !== undefined) return { started: false, resolvedBy: merged };

    const pullRequest = await this.provider.createDraftPullRequest({
      issue: issue.ref,
      baseBranch: this.baseBranch,
      title: pullRequestTitle(issue),
      body: pullRequestBody(issue),
      draft: true,
    });
    await this.runTurn('propose', pullRequest, [], [], null);
    this.logger(`started workflow for issue #${issue.ref.number} (PR #${pullRequest.ref.number})`);
    return { started: true, pullRequest };
  }

  /**
   * Retry the propose turn for a pull request left behind by an interrupted or
   * failed turn. The poller calls this for an open pull request whose phase is
   * absent or `failed`, so a restart resumes the workflow instead of leaving it
   * blocked behind its own pull request.
   *
   * Attempted at most once per pull request per process: a later restart (a new
   * process) grants one more attempt, but the poll loop never retries in a loop.
   */
  async recover(pullRequest: ProviderPullRequest): Promise<boolean> {
    if (this.recovered.has(pullRequest.ref.number)) return false;
    this.recovered.add(pullRequest.ref.number);
    const reviews = await this.provider.listReviews(pullRequest.ref);
    const comments = await this.provider.listComments(this.target(pullRequest));
    this.logger(`PR #${pullRequest.ref.number}: recovering after an interrupted or failed turn`);
    await this.runTurn('propose', pullRequest, reviews, comments, null);
    return true;
  }

  /**
   * Recover a `proposing` workflow that never produced a proposal: its branch
   * carries no change relative to the base, so there is nothing for a human to
   * review and the review-driven decision can never drive it again. A branch
   * that does carry a change is a normal in-flight proposal and is left alone.
   * Like `recover`, attempted at most once per pull request per process.
   */
  async recoverStalled(pullRequest: ProviderPullRequest): Promise<boolean> {
    if (this.recovered.has(pullRequest.ref.number)) return false;
    this.recovered.add(pullRequest.ref.number);

    const handle = await this.sandbox.create({ branch: pullRequest.branch });
    let stalled: boolean;
    try {
      // An unresolved base merge also needs a turn, so treat it as stalled.
      stalled = !(await handle.baseIntegrated()) || !(await handle.hasChanges());
    } catch (error) {
      await handle.dispose();
      throw error;
    }

    if (!stalled) {
      await handle.dispose();
      this.logger(`PR #${pullRequest.ref.number}: branch carries a proposal; leaving it to review`);
      return false;
    }

    const reviews = await this.provider.listReviews(pullRequest.ref);
    const comments = await this.provider.listComments(this.target(pullRequest));
    this.logger(
      `PR #${pullRequest.ref.number}: recovering a proposing workflow whose branch has no proposal`,
    );
    await this.runTurn('propose', pullRequest, reviews, comments, null, handle);
    return true;
  }

  /** Evaluate and perform the next action for an in-flight workflow. */
  async drive(pullRequest: ProviderPullRequest): Promise<WorkflowAction> {
    const botLogin = await this.getBotLogin();
    const issue = await this.resolveIssue(pullRequest);
    const reviews = await this.provider.listReviews(pullRequest.ref);
    const comments = await this.provider.listComments(this.target(pullRequest));

    const human = latestHumanReview(reviews, botLogin);
    const latestHumanReviewEvent =
      human === null
        ? null
        : reviewEvent({
            id: human.id,
            at: human.at,
            actor: human.author,
            state: human.state,
            body: human.body,
            pullRequest: pullRequest.ref,
          });

    const action = decide({
      triggerLabelPresent: issue !== null && issue.labels.includes(this.labels.trigger),
      pullRequestState: pullRequest.state,
      phase: phaseFromLabels(this.labels, pullRequest.labels) ?? 'proposing',
      latestHumanReview: latestHumanReviewEvent,
      lastTurnAt: answeredAt(comments, botLogin),
      reviseRounds: Math.max(0, ownProposeTurns(comments, botLogin) - 1),
      maxReviseRounds: this.maxReviseRounds,
    });

    const reason = 'reason' in action ? ` (${action.reason})` : '';
    this.logger(`PR #${pullRequest.ref.number}: decision ${action.kind}${reason}`);

    await this.perform(action, pullRequest, reviews, comments);
    return action;
  }

  private async perform(
    action: WorkflowAction,
    pullRequest: ProviderPullRequest,
    reviews: ProviderReview[],
    comments: ProviderComment[],
  ): Promise<void> {
    switch (action.kind) {
      case 'idle':
        return;
      case 'revise':
        await this.runTurn('propose', pullRequest, reviews, comments, action.trigger);
        return;
      case 'apply':
        // The claim: mark implementing BEFORE running the turn, so a later push
        // that dismisses the approval cannot re-trigger apply.
        await this.setPhase(pullRequest, 'implementing');
        await this.runTurn('apply', pullRequest, reviews, comments, action.trigger);
        return;
      case 'finish':
        await this.setPhase(pullRequest, 'done');
        await this.comment(
          pullRequest,
          withLastTurnMetrics('Merged. Workflow complete.', latestUsage(comments)),
          reviews,
        );
        return;
      case 'fail':
        await this.signalFailure(pullRequest, new Error(action.reason), { comments, reviews });
        return;
      case 'cancel':
        await this.clearPhase(pullRequest);
        await this.comment(
          pullRequest,
          withLastTurnMetrics(`Workflow cancelled: ${action.reason}.`, latestUsage(comments)),
          reviews,
        );
        return;
    }
  }

  private buildContext(
    skill: TurnSkill,
    pullRequest: ProviderPullRequest,
    reviews: ProviderReview[],
    comments: ProviderComment[],
    trigger: NormalizedEvent | null,
    pendingBaseIntegration: boolean,
  ): TurnContext {
    const number =
      pullRequest.linkedIssue?.number ?? issueNumberFromBranch(pullRequest.branch) ?? 0;
    return {
      skill,
      repo: this.provider.repo,
      issue: { repo: this.provider.repo, number },
      pullRequest: pullRequest.ref,
      branch: pullRequest.branch,
      baseBranch: pullRequest.baseBranch === '' ? this.baseBranch : pullRequest.baseBranch,
      transcript: buildTranscript(reviews, comments),
      pendingFeedback: trigger === null ? [] : [trigger],
      pendingBaseIntegration,
    };
  }

  private async runTurn(
    skill: TurnSkill,
    pullRequest: ProviderPullRequest,
    reviews: ProviderReview[],
    comments: ProviderComment[],
    trigger: NormalizedEvent | null,
    existingHandle?: SandboxHandle,
  ): Promise<void> {
    const turn = `PR #${pullRequest.ref.number} ${skill} turn`;
    this.logger(
      `PR #${pullRequest.ref.number}: starting ${skill} turn (branch ${pullRequest.branch})`,
    );
    // A caller that already provisioned a workspace for its own check hands it
    // in so the turn does not provision a second one; the turn owns disposal.
    const handle = existingHandle ?? (await this.sandbox.create({ branch: pullRequest.branch }));
    // Usage the runtime streams and the wall clock the orchestrator measures are
    // collected outside the try so the failure path can report both.
    const reported: TurnUsage = {};
    let attempts = 0;
    const startedAt = Date.now();
    try {
      // The branch tip is read around every turn: a propose turn that commits
      // nothing is detected from repository state, not from the runtime's
      // self-report (the embedded adapter always reports an empty commit list),
      // and an apply turn's own commits are read from `beforeTip..HEAD` to
      // reconcile the pull request title. The base merge, if any, is committed
      // while provisioning, before this first read.
      const beforeTip = await handle.head();
      const pendingBaseIntegration = !(await handle.baseIntegrated());
      const context = this.buildContext(
        skill,
        pullRequest,
        reviews,
        comments,
        trigger,
        pendingBaseIntegration,
      );
      const result = await this.withRetry(turn, () => {
        attempts += 1;
        return this.runtime.run({
          context,
          workspace: handle.workspace,
          store: handle.store,
          environment: this.environment,
          limits: this.limits,
          onUsage: (usage) => accumulateUsage(reported, usage),
        });
      });
      // Combine what the runtime reported with the time and attempts the
      // orchestrator measured, so the comment is complete for every runtime.
      const usage = withMeasuredUsage(mergeUsage(reported, result.usage), startedAt, attempts);
      if (skill === 'propose' && trigger === null && (await handle.head()) === beforeTip) {
        this.logger(`${turn}: the workflow branch tip is unchanged; treating the turn as failed`);
        throw new NoProgressError();
      }
      // A turn's commits live only in the throwaway worktree, so publish the
      // workflow branch before anything else observes the turn. Least-privilege
      // is enforced here: the orchestrator only ever pushes its own branch.
      assertPushAllowed({ branch: pullRequest.branch, protectedBranches: [this.baseBranch] });
      // The branch must be on the current base before it is published: a turn
      // that left the base merge unresolved fails instead of pushing a stale
      // branch (and leaving an unmergeable pull request).
      if (!(await handle.baseIntegrated())) throw new BaseIntegrationError(this.baseBranch);
      await this.provider.push({ branch: pullRequest.branch, destination: handle.workspace });
      await this.postTurn(pullRequest, result, usage, reviews);
      const commits =
        result.commits.length === 0 ? 'no commits' : `commits ${result.commits.join(', ')}`;
      this.logger(`${turn} succeeded with ${commits}`);

      if (skill === 'propose') {
        const readiness = await evaluateReadiness(this.openspec, handle.workspace);
        this.logger(
          `${turn}: readiness ${readiness.ready ? 'ready' : 'not ready'} (${readiness.reason})`,
        );
        await this.setPhase(pullRequest, readiness.ready ? 'ready' : 'proposing');
        if (readiness.ready) {
          await this.comment(
            pullRequest,
            withTurnMetrics('The change is ready for development. Approve to implement.', usage),
            reviews,
          );
        }
      } else {
        // The apply turn implements and archives the change. Reconcile the pull
        // request title with the subjects the turn committed (best-effort: a
        // failure is reported, not fatal), then release the draft pull request
        // now so a human can review and merge it. A failure here falls through
        // to the catch and marks the workflow failed rather than leaving a
        // task-complete pull request stuck in draft.
        await this.reconcileTitle(pullRequest, handle, beforeTip, reviews);
        await this.provider.markPullRequestReady(pullRequest.ref);
        await this.setPhase(pullRequest, 'implementing');
      }
    } catch (error) {
      this.logger(`${turn} failed: ${describeError(error)}`);
      // The failure comment reports the partial usage, elapsed time, and
      // attempts of the turn that just failed.
      await this.signalFailure(pullRequest, error, {
        usage: withMeasuredUsage(reported, startedAt, attempts),
        reviews,
      });
    } finally {
      await handle.dispose();
    }
  }

  private async withRetry<T>(context: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryable(error)) throw error;
      this.logger(`${context}: retrying after transient failure: ${describeError(error)}`);
      return operation();
    }
  }

  /**
   * Reconcile the pull request title with the Conventional Commit subjects the
   * just-finished apply turn added (the applied outcome), so the subject the
   * host derives on merge reflects what was implemented. Best-effort: reading
   * the subjects or updating the title may fail without failing the workflow,
   * because the title is already a valid Conventional Commit subject.
   */
  private async reconcileTitle(
    pullRequest: ProviderPullRequest,
    handle: SandboxHandle,
    beforeTip: string,
    reviews: ProviderReview[],
  ): Promise<void> {
    let subjects: string[];
    try {
      subjects = await handle.commitSubjects(beforeTip);
    } catch (error) {
      this.logger(
        `PR #${pullRequest.ref.number}: could not read the apply turn's commit subjects; ` +
          `keeping the deduced title (${describeError(error)})`,
      );
      return;
    }
    const title = reconcileConventionalTitle(pullRequest.title, subjects);
    if (title === pullRequest.title) return;
    try {
      await this.provider.updatePullRequest(pullRequest.ref, { title });
      this.logger(`PR #${pullRequest.ref.number}: reconciled the title to '${title}'`);
    } catch (error) {
      const message = describeError(error);
      this.logger(`PR #${pullRequest.ref.number}: updating the title failed: ${message}`);
      try {
        await this.comment(
          pullRequest,
          `Could not update the pull request title: ${message}`,
          reviews,
        );
      } catch {
        // Reporting is best-effort; the workflow still advances.
      }
    }
  }

  private async postTurn(
    pullRequest: ProviderPullRequest,
    result: TurnResult,
    usage: TurnUsage,
    reviews: ProviderReview[],
  ): Promise<void> {
    const lines = [
      turnHeading(result.skill),
      '',
      result.summary === '' ? '(no summary)' : result.summary,
    ];
    if (result.commits.length > 0) lines.push('', `Commits: ${result.commits.join(', ')}`);
    if (result.questions.length > 0) {
      lines.push('', '**Questions for the reviewer:**', ...result.questions.map((q) => `- ${q}`));
    }
    await this.comment(pullRequest, withTurnMetrics(lines.join('\n'), usage), reviews);
  }

  /**
   * Post on the workflow pull request. Every comment records the newest human
   * review the action read, which is what marks that feedback answered: a
   * review submitted while a turn runs is newer and drives the next turn.
   */
  private async comment(
    pullRequest: ProviderPullRequest,
    body: string,
    reviews: ProviderReview[],
  ): Promise<void> {
    const read = latestHumanReview(reviews, await this.getBotLogin());
    await this.provider.comment(
      this.target(pullRequest),
      `${body}\n${answeredMarker(read?.at ?? null)}`,
    );
  }

  private async setPhase(pullRequest: ProviderPullRequest, phase: WorkflowPhase): Promise<void> {
    const target = this.target(pullRequest);
    const targetLabel = labelForPhase(this.labels, phase);
    for (const label of allPhaseLabels(this.labels)) {
      if (label !== targetLabel) await this.provider.removeLabel(target, label);
    }
    await this.provider.addLabels(target, [targetLabel]);
  }

  private async clearPhase(pullRequest: ProviderPullRequest): Promise<void> {
    const target = this.target(pullRequest);
    for (const label of allPhaseLabels(this.labels)) await this.provider.removeLabel(target, label);
  }

  /**
   * Fail the workflow and post the failure on the pull request. A failure with
   * a turn behind it reports that turn's metrics; a transition failure such as
   * the revise limit repeats the last turn's metrics instead.
   */
  private async signalFailure(
    pullRequest: ProviderPullRequest,
    error: unknown,
    context: { usage?: TurnUsage; comments?: ProviderComment[]; reviews: ProviderReview[] },
  ): Promise<void> {
    await this.setPhase(pullRequest, 'failed');
    const body = `Workflow failed: ${describeError(error)}`;
    const comment =
      context.usage === undefined
        ? withLastTurnMetrics(body, latestUsage(context.comments ?? []))
        : withTurnMetrics(body, context.usage);
    await this.comment(pullRequest, comment, context.reviews);
    this.logger(`PR #${pullRequest.ref.number} failed: ${describeError(error)}`);
  }
}
