import { stat } from 'node:fs/promises';

import { NodeCommandRunner, type CommandRunner } from '../system/commands.js';

/** The subset of a file's metadata needed to tell whether it is a device. */
export interface DeviceStatResult {
  isCharacterDevice(): boolean;
}

/** Reads metadata for a path, following symlinks. Injectable for tests. */
export type DeviceStat = (path: string) => Promise<DeviceStatResult>;

/** Resolves a host group name to its gid; `undefined` when it does not exist. */
export type GroupResolver = (name: string) => Promise<number | undefined>;

/**
 * Thrown when a configured device path is not usable at turn start. The message
 * names the configured path so a failed turn points at the hardware rather than
 * at a transient node the operator never configured.
 */
export class DeviceUnavailableError extends Error {
  readonly device: string;

  constructor(device: string, reason: string) {
    super(`device '${device}' ${reason}`);
    this.name = 'DeviceUnavailableError';
    this.device = device;
  }
}

/**
 * Check that a configured device is an absolute path pointing at a character
 * device. `stat` follows symlinks, so a stable udev name is resolved to its
 * current target each turn; a dangling link and a non-device path both fail.
 */
export async function assertDeviceAvailable(
  device: string,
  statDevice: DeviceStat = stat,
): Promise<void> {
  if (!device.startsWith('/')) {
    throw new DeviceUnavailableError(device, 'must be an absolute host path');
  }
  let metadata: DeviceStatResult;
  try {
    metadata = await statDevice(device);
  } catch {
    throw new DeviceUnavailableError(device, 'is missing or dangling');
  }
  if (!metadata.isCharacterDevice()) {
    throw new DeviceUnavailableError(device, 'is not a character device');
  }
}

/**
 * The default {@link GroupResolver}: look the name up in the host's group
 * database with `getent group`, which honours NSS sources such as LDAP. The gid
 * is the third colon-separated field. A missing group, a failed lookup, or a
 * host without `getent` all resolve to `undefined` so the caller fails the turn
 * naming the group rather than guessing a gid.
 */
export function hostGroupResolver(
  commands: CommandRunner = new NodeCommandRunner(),
): GroupResolver {
  return async (name: string): Promise<number | undefined> => {
    try {
      const result = await commands.run('getent', ['group', name]);
      if (result.code !== 0) return undefined;
      const fields = result.stdout.trim().split(':');
      const gid = Number(fields[2]);
      return Number.isInteger(gid) && gid >= 0 ? gid : undefined;
    } catch {
      return undefined;
    }
  };
}
