import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve the `@opencode/sdk` version installed alongside the code that calls
 * this. On the host that is the orchestrator's own dependency; inside a turn
 * container it is the version the image installed. Resolving it per module
 * location (not from the host's `package.json`) is what lets the runner detect
 * an image whose SDK has drifted from the orchestrator's.
 */
export function resolveSdkVersion(): string {
  // `import.meta.resolve` follows the package's `exports` map, which does not
  // expose `package.json`; walk up from the resolved entry point instead.
  const entry = fileURLToPath(import.meta.resolve('@opencode/sdk'));
  const packagePath = join(dirname(dirname(entry)), 'package.json');
  const manifest = JSON.parse(readFileSync(packagePath, 'utf8')) as {
    name?: string;
    version?: string;
  };
  if (manifest.version === undefined || manifest.version === '') {
    throw new Error(`could not read a version from '${packagePath}'`);
  }
  return manifest.version;
}
