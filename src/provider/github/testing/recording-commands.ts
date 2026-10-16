import type { CommandResult, CommandRunOptions, CommandRunner } from '../commands.js';

/** A `CommandRunner` that records invocations and returns a canned result. */
export class RecordingCommands implements CommandRunner {
  readonly runs: {
    command: string;
    args: string[];
    env: NodeJS.ProcessEnv | undefined;
    stdin: string | undefined;
  }[] = [];

  constructor(private readonly result: CommandResult = { code: 0, stdout: '', stderr: '' }) {}

  async run(
    command: string,
    args: string[],
    options: CommandRunOptions = {},
  ): Promise<CommandResult> {
    this.runs.push({ command, args, env: options.env, stdin: options.stdin });
    return this.result;
  }
}
