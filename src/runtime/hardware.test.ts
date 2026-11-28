import { describe, expect, it } from 'vitest';

import type { CommandRunOptions, CommandResult, CommandRunner } from '../system/commands.js';
import {
  buildHardwareManifest,
  describeDeviceIdentity,
  udevDeviceIdentityProbe,
  type DeviceIdentity,
} from './hardware.js';

/** A command runner that records calls and returns a scripted result. */
class FakeCommandRunner implements CommandRunner {
  readonly calls: { command: string; args: string[] }[] = [];

  constructor(private readonly behavior: () => Promise<CommandResult>) {}

  async run(command: string, args: string[], _options?: CommandRunOptions): Promise<CommandResult> {
    this.calls.push({ command, args });
    return this.behavior();
  }
}

const UDEV_OUTPUT = [
  'DEVLINKS=/dev/qtpy2 /dev/serial/by-id/usb-Adafruit_QT_Py_ESP32-S2_ABC-if00',
  'ID_MODEL=QT_Py_ESP32-S2',
  'ID_MODEL_ID=8111',
  'ID_SERIAL_SHORT=ABC',
  'ID_VENDOR_ID=239a',
  'SUBSYSTEM=tty',
  '',
].join('\n');

describe('udevDeviceIdentityProbe', () => {
  it('parses the identity properties for a configured path', async () => {
    const commands = new FakeCommandRunner(async () => ({
      code: 0,
      stdout: UDEV_OUTPUT,
      stderr: '',
    }));

    const identity = await udevDeviceIdentityProbe(commands)('/dev/qtpy2');

    expect(commands.calls).toEqual([
      { command: 'udevadm', args: ['info', '--query=property', '--name=/dev/qtpy2'] },
    ]);
    expect(identity).toEqual({
      vendorId: '239a',
      productId: '8111',
      model: 'QT_Py_ESP32-S2',
      serial: 'ABC',
      subsystem: 'tty',
      devlinks: ['/dev/qtpy2', '/dev/serial/by-id/usb-Adafruit_QT_Py_ESP32-S2_ABC-if00'],
    });
  });

  it('returns undefined when the probe exits non-zero', async () => {
    const commands = new FakeCommandRunner(async () => ({
      code: 1,
      stdout: '',
      stderr: 'Unknown device',
    }));

    await expect(udevDeviceIdentityProbe(commands)('/dev/qtpy2')).resolves.toBeUndefined();
  });

  it('returns undefined when udevadm is missing', async () => {
    const commands = new FakeCommandRunner(async () => {
      throw new Error('spawn udevadm ENOENT');
    });

    await expect(udevDeviceIdentityProbe(commands)('/dev/qtpy2')).resolves.toBeUndefined();
  });

  it('returns undefined when the probe reports no properties', async () => {
    const commands = new FakeCommandRunner(async () => ({
      code: 0,
      stdout: '',
      stderr: '',
    }));

    await expect(udevDeviceIdentityProbe(commands)('/dev/qtpy2')).resolves.toBeUndefined();
  });
});

describe('buildHardwareManifest', () => {
  const IDENTITY: DeviceIdentity = {
    vendorId: '239a',
    productId: '8111',
    model: 'QT_Py_ESP32-S2',
    serial: 'ABC',
  };

  it('keeps a configured description next to the detected identity', async () => {
    const manifest = await buildHardwareManifest(
      [{ path: '/dev/qtpy2', description: 'Adafruit QT Py ESP32-S2' }],
      async () => IDENTITY,
    );

    expect(manifest).toEqual({
      devices: [
        {
          path: '/dev/qtpy2',
          description: 'Adafruit QT Py ESP32-S2',
          identity: IDENTITY,
        },
      ],
    });
  });

  it('keeps a bare device as a path when no description is configured', async () => {
    const manifest = await buildHardwareManifest([{ path: '/dev/jtum120' }], async () => IDENTITY);

    expect(manifest).toEqual({
      devices: [{ path: '/dev/jtum120', identity: IDENTITY }],
    });
  });

  it('keeps the configured description when the probe fails', async () => {
    const manifest = await buildHardwareManifest(
      [{ path: '/dev/qtpy2', description: 'Adafruit QT Py ESP32-S2' }],
      async () => undefined,
    );

    expect(manifest).toEqual({
      devices: [{ path: '/dev/qtpy2', description: 'Adafruit QT Py ESP32-S2' }],
    });
  });
});

describe('describeDeviceIdentity', () => {
  it('summarizes vendor/product, model, and serial', () => {
    expect(
      describeDeviceIdentity({
        vendorId: '239a',
        productId: '8111',
        model: 'QT_Py_ESP32-S2',
        serial: 'ABC',
      }),
    ).toBe('USB 239a:8111, QT_Py_ESP32-S2, serial ABC');
  });

  it('returns an empty summary when nothing was probed', () => {
    expect(describeDeviceIdentity(undefined)).toBe('');
  });
});
