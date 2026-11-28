import { stat } from 'node:fs/promises';

import type { DeviceSpec } from '../config/types.js';
import { NodeCommandRunner, type CommandRunner } from '../system/commands.js';

/** The stable, read-only container path a turn reads its hardware manifest from. */
export const HARDWARE_MANIFEST_PATH = '/tmp/orchestrator-hardware.json';

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

/**
 * The host identity of a configured device, read from the host's udev property
 * database. Every field is optional: `udevadm` can report a partial record, and
 * the advertisement falls back to the configured description when it does not.
 */
export interface DeviceIdentity {
  vendorId?: string;
  productId?: string;
  model?: string;
  serial?: string;
  subsystem?: string;
  devlinks?: string[];
}

/** Probes one configured device path; `undefined` when the host cannot report it. */
export type DeviceIdentityProbe = (path: string) => Promise<DeviceIdentity | undefined>;

/** A device identity field that holds a plain string. */
type StringIdentityField = 'vendorId' | 'productId' | 'model' | 'serial' | 'subsystem';

/** Store a non-empty udev property on an optional identity field. */
function assignIdentityField(
  identity: DeviceIdentity,
  field: StringIdentityField,
  value: string | undefined,
): void {
  if (value !== undefined && value !== '') identity[field] = value;
}

/**
 * Read a device's identity from the host's udev database with
 * `udevadm info --query=property --name=<path>`. Best-effort: a missing
 * `udevadm`, a non-zero exit, or an empty property list yields `undefined`
 * rather than failing the turn, because only the path availability check is
 * authoritative.
 */
export function udevDeviceIdentityProbe(
  commands: CommandRunner = new NodeCommandRunner(),
): DeviceIdentityProbe {
  return async (path: string): Promise<DeviceIdentity | undefined> => {
    let result;
    try {
      result = await commands.run('udevadm', ['info', '--query=property', `--name=${path}`]);
    } catch {
      return undefined;
    }
    if (result.code !== 0) return undefined;

    const properties = new Map<string, string>();
    for (const line of result.stdout.split('\n')) {
      const separator = line.indexOf('=');
      if (separator <= 0) continue;
      properties.set(line.slice(0, separator), line.slice(separator + 1));
    }
    if (properties.size === 0) return undefined;

    const identity: DeviceIdentity = {};
    assignIdentityField(identity, 'vendorId', properties.get('ID_VENDOR_ID'));
    assignIdentityField(identity, 'productId', properties.get('ID_MODEL_ID'));
    assignIdentityField(identity, 'model', properties.get('ID_MODEL'));
    assignIdentityField(identity, 'serial', properties.get('ID_SERIAL_SHORT'));
    assignIdentityField(identity, 'subsystem', properties.get('SUBSYSTEM'));
    const devlinks = properties.get('DEVLINKS');
    if (devlinks !== undefined) {
      const links = devlinks.split(/\s+/).filter((link) => link !== '');
      if (links.length > 0) identity.devlinks = links;
    }
    return Object.keys(identity).length === 0 ? undefined : identity;
  };
}

/** One exposed device in the per-turn hardware manifest. */
export interface HardwareDevice {
  path: string;
  description?: string;
  identity?: DeviceIdentity;
}

/**
 * The per-turn hardware inventory handed to a containerized turn. It describes
 * only the devices the environment exposes, never an ambient host inventory.
 */
export interface HardwareManifest {
  devices: HardwareDevice[];
}

/**
 * Combine configured device entries with their probed host identity. A
 * configured description survives a failed probe, and a device the host cannot
 * identify still appears as a bare path.
 */
export async function buildHardwareManifest(
  devices: DeviceSpec[],
  probe: DeviceIdentityProbe = udevDeviceIdentityProbe(),
): Promise<HardwareManifest> {
  const entries = await Promise.all(
    devices.map(async (device): Promise<HardwareDevice> => {
      const identity = await probe(device.path);
      return {
        path: device.path,
        ...(device.description === undefined ? {} : { description: device.description }),
        ...(identity === undefined ? {} : { identity }),
      };
    }),
  );
  return { devices: entries };
}

/**
 * A compact one-line summary of detected identity, such as
 * `USB 239a:8111, QT Py ESP32-S2, serial ABC`. Empty when nothing was probed.
 */
export function describeDeviceIdentity(identity: DeviceIdentity | undefined): string {
  if (identity === undefined) return '';
  const parts: string[] = [];
  if (identity.vendorId !== undefined && identity.productId !== undefined) {
    parts.push(`USB ${identity.vendorId}:${identity.productId}`);
  } else if (identity.vendorId !== undefined) {
    parts.push(`vendor ${identity.vendorId}`);
  }
  if (identity.model !== undefined) parts.push(identity.model);
  if (identity.serial !== undefined) parts.push(`serial ${identity.serial}`);
  return parts.join(', ');
}

/**
 * The advertised summary of one device: its configured description, with the
 * detected identity in parentheses when both are present. Either part can be
 * absent, and an unknown device is just its path.
 */
export function describeHardwareDevice(device: HardwareDevice): string {
  const identity = describeDeviceIdentity(device.identity);
  if (device.description === undefined) return identity;
  if (identity === '') return device.description;
  return `${device.description} (${identity})`;
}
