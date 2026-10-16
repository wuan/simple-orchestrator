import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Expand a leading `~` (or a bare `~`) to the user's home directory. Paths that
 * do not start with `~` are returned unchanged, so relative and absolute paths
 * pass through untouched.
 */
export function expandHome(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/')) return join(homedir(), path.slice(2));
  return path;
}
