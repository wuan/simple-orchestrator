import type { TurnContext, TurnResult } from '../../domain/types.js';
import {
  buildHardwareManifest,
  describeHardwareDevice,
  HARDWARE_MANIFEST_PATH,
  udevDeviceIdentityProbe,
  type DeviceIdentityProbe,
  type HardwareDevice,
  type HardwareManifest,
} from '../hardware.js';
import type { AgentRuntime, TurnRequest } from '../types.js';
import type { OpenCodeClient } from './client.js';

const SKILL_INSTRUCTIONS: Record<TurnContext['skill'], string> = {
  propose:
    'Create or revise the OpenSpec change so it is ready for development. Answer the reviewer feedback above, ask any questions you still have, and keep the change artifacts coherent.',
  apply:
    'Implement the change tasks, then run `openspec archive` and include the archived change, the updated code, and the updated specs in your commit.',
};

/** One advertised device line, with its configured hint and detected identity. */
function hardwareDeviceLine(device: HardwareDevice): string {
  const detail = describeHardwareDevice(device);
  return detail === '' ? `- ${device.path}` : `- ${device.path} - ${detail}`;
}

/**
 * The compact hardware advertisement. Only the devices this turn's environment
 * exposes appear; full detail stays in the manifest the instruction names.
 */
function hardwareLines(manifest: HardwareManifest): string[] {
  return [
    'Hardware exposed to this turn:',
    ...manifest.devices.map(hardwareDeviceLine),
    `Full detail: ${HARDWARE_MANIFEST_PATH}`,
    'A turn holds these devices until it ends. Sensors, displays, pin maps, and protocols are documented by the repository; consult it for physical context.',
  ];
}

/**
 * Compose the instruction handed to the agent for a turn. The agent is told to
 * commit only to the workflow branch - the orchestrator publishes it - and to
 * report a structured outcome.
 */
export function buildSkillPrompt(context: TurnContext, manifest?: HardwareManifest): string {
  const changeLine =
    context.changeName === undefined ? '' : ` for change \`${context.changeName}\``;
  const feedback =
    context.pendingFeedback.length === 0
      ? '(no new reviewer feedback)'
      : context.pendingFeedback
          .map((event) => `- ${event.kind} by ${event.actor.login}`)
          .join('\n');

  const constraints = [
    `- Commit all work to the workflow branch \`${context.branch}\` only. The orchestrator publishes that branch after the turn, so do not push, do not write to another branch, and do not merge the pull request.`,
    '- Follow the OpenSpec workflow and validate the change before declaring it ready.',
  ];
  if (context.pendingBaseIntegration === true) {
    constraints.unshift(
      `- The workspace carries an unresolved merge of the base branch \`${context.baseBranch}\`. Resolve every conflict, complete the merge, and commit it before you finish; a turn that leaves the base unintegrated fails.`,
    );
  }

  return [
    `You are running the OpenSpec \`${context.skill}\` workflow${changeLine} on branch \`${context.branch}\`.`,
    SKILL_INSTRUCTIONS[context.skill],
    ...(manifest === undefined || manifest.devices.length === 0
      ? []
      : ['', ...hardwareLines(manifest)]),
    '',
    'New reviewer feedback to address:',
    feedback,
    '',
    'Constraints:',
    ...constraints,
    '',
    'Report a short summary, any questions for the human, the commit SHAs produced, and whether you need input. Do not comment on whether the branch has been pushed; the orchestrator publishes it.',
  ].join('\n');
}

export interface OpenCodeRuntimeOptions {
  /** Probes a configured device's host identity; defaults to `udevadm`. */
  probe?: DeviceIdentityProbe;
}

/** Runs OpenSpec skills through an OpenCode client. */
export class OpenCodeRuntime implements AgentRuntime {
  readonly id = 'opencode';

  private readonly probe: DeviceIdentityProbe;

  constructor(
    private readonly client: OpenCodeClient,
    options: OpenCodeRuntimeOptions = {},
  ) {
    this.probe = options.probe ?? udevDeviceIdentityProbe();
  }

  async run(request: TurnRequest): Promise<TurnResult> {
    const devices = request.environment?.devices ?? [];
    const hardware =
      devices.length === 0 ? undefined : await buildHardwareManifest(devices, this.probe);
    const prompt = buildSkillPrompt(request.context, hardware);
    const result = await this.client.runSkill({
      skill: request.context.skill,
      workspace: request.workspace,
      prompt,
      repo: request.context.repo,
      store: request.store,
      environment: request.environment,
      ...(hardware === undefined ? {} : { hardware }),
      signal: request.signal,
      onUsage: request.onUsage,
    });
    return { skill: request.context.skill, ...result };
  }
}
