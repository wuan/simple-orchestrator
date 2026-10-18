import { spawn } from 'node:child_process';
import process from 'node:process';

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface CommandRunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Text written to the child's stdin; the stream is closed afterwards. */
  stdin?: string;
}

/** Runs external commands; injectable so behavior can be tested. */
export interface CommandRunner {
  run(command: string, args: string[], options?: CommandRunOptions): Promise<CommandResult>;
}

export class NodeCommandRunner implements CommandRunner {
  run(command: string, args: string[], options: CommandRunOptions = {}): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      if (options.stdin !== undefined) {
        child.stdin.end(options.stdin);
      }
      child.on('error', reject);
      child.on('close', (code) => {
        resolve({ code: code ?? -1, stdout, stderr });
      });
    });
  }
}

export interface ContainerRunOptions {
  /** Arguments passed to the container executable. */
  args: string[];
  /** Text written to the process's stdin; the stream is closed afterwards. */
  input: string;
  /** Aborted to stop the container. */
  signal?: AbortSignal;
  /** Called incrementally as the container writes to stdout. */
  onStdout?: (chunk: string) => void;
  /** Called incrementally as the container writes to stderr. */
  onStderr?: (chunk: string) => void;
  /** The executable to run; defaults to `docker`. */
  command?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ContainerRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Runs one container to completion, streaming its output and stopping it when
 * the turn's signal aborts. Injectable so a container turn can be tested
 * without Docker.
 */
export interface ContainerRunner {
  run(options: ContainerRunOptions): Promise<ContainerRunResult>;
}

/** Grace period between the polite and forced kill of a container. */
const KILL_GRACE_MS = 5_000;

/**
 * A {@link ContainerRunner} backed by the `docker` CLI. The spawned client is
 * `docker run -i`, which proxies the signal to the container, so a polite
 * `SIGTERM` stops the container and `--rm` removes it; a forced kill follows if
 * the client does not exit within the grace period.
 */
export class NodeContainerRunner implements ContainerRunner {
  run(options: ContainerRunOptions): Promise<ContainerRunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(options.command ?? 'docker', options.args, {
        env: options.env ?? process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      let killTimer: NodeJS.Timeout | undefined;

      const cleanup = (): void => {
        if (killTimer !== undefined) clearTimeout(killTimer);
        options.signal?.removeEventListener('abort', onAbort);
      };
      const settle = (settleWith: () => void): void => {
        if (settled) return;
        settled = true;
        cleanup();
        settleWith();
      };
      const onAbort = (): void => {
        child.kill('SIGTERM');
        killTimer ??= setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
        killTimer.unref?.();
      };

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        options.onStdout?.(text);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        options.onStderr?.(text);
      });
      child.on('error', (error) => settle(() => reject(error)));
      child.on('close', (code) => settle(() => resolve({ code, stdout, stderr })));

      if (options.signal !== undefined) {
        if (options.signal.aborted) onAbort();
        else options.signal.addEventListener('abort', onAbort, { once: true });
      }
      child.stdin.end(options.input);
    });
  }
}
