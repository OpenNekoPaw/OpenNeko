import { describe, expect, it } from 'vitest';
import viewportProtocolFixture from '../__fixtures__/viewport-protocol-v1.json';
import {
  createViewportPayloadGuardRegistry,
  isViewportControlFlowDiagnostic,
  isViewportCommand,
  isViewportEvent,
  isViewportFrameMeta,
  isViewportMetadataEvent,
  isViewportOverlayDescriptor,
  isViewportSerializableValue,
  isViewportToolbarItem,
  validateViewportCommandPayload,
  VIEWPORT_PROTOCOL_VERSION,
  type ViewportCommand,
  type ViewportSerializableRecord,
} from '../viewport-protocol';

interface ViewportProtocolFixture {
  readonly command: unknown;
  readonly sceneCommand: unknown;
  readonly ackEvent: unknown;
  readonly errorEvent: unknown;
  readonly frameMeta: unknown;
  readonly metadataEvent: unknown;
  readonly controlDiagnostics: readonly unknown[];
  readonly overlays: readonly unknown[];
  readonly toolbar: readonly unknown[];
}

function expectJsonSerializable(value: unknown): void {
  expect(JSON.parse(JSON.stringify(value))).toEqual(value);
}

describe('viewport protocol L0 contracts', () => {
  const fixture = viewportProtocolFixture as ViewportProtocolFixture;

  it('validates command, event, frame metadata, overlay, and toolbar fixtures', () => {
    expect(isViewportCommand(fixture.command)).toBe(true);
    expect(isViewportCommand(fixture.sceneCommand)).toBe(true);
    expect(isViewportEvent(fixture.ackEvent)).toBe(true);
    expect(isViewportEvent(fixture.errorEvent)).toBe(true);
    expect(isViewportFrameMeta(fixture.frameMeta)).toBe(true);
    expect(isViewportMetadataEvent(fixture.metadataEvent)).toBe(true);
    expect(
      fixture.controlDiagnostics.every((diagnostic) => isViewportControlFlowDiagnostic(diagnostic)),
    ).toBe(true);
    expect(fixture.overlays.every((overlay) => isViewportOverlayDescriptor(overlay))).toBe(true);
    expect(fixture.toolbar.every((item) => isViewportToolbarItem(item))).toBe(true);
    expectJsonSerializable(fixture);
  });

  it('enforces protocolVersion 1 and rejects incompatible envelopes', () => {
    expect(VIEWPORT_PROTOCOL_VERSION).toBe(1);
    expect(
      isViewportCommand({
        ...fixture.command,
        protocolVersion: 2,
      }),
    ).toBe(false);
    expect(
      isViewportEvent({
        ...fixture.ackEvent,
        protocolVersion: 2,
      }),
    ).toBe(false);
  });

  it('preserves baseRevision and ack/error semantics', () => {
    expect(isViewportCommand(fixture.sceneCommand)).toBe(true);
    const command = fixture.sceneCommand as ViewportCommand;

    expect(command.baseRevision).toBe(10);
    expect(command.domain).toBe('scene');
    expect(command.action).toBe('scene:puppet:dragBone');

    expect(isViewportEvent(fixture.ackEvent)).toBe(true);
    expect(isViewportEvent(fixture.errorEvent)).toBe(true);
    expect((fixture.ackEvent as { readonly ackSeq: number }).ackSeq).toBe(42);
    expect((fixture.errorEvent as { readonly error?: { readonly code: string } }).error?.code).toBe(
      'revisionConflict',
    );
  });

  it('allows degraded toolbar descriptors for unavailable scene-control operations', () => {
    const degradedItem = fixture.toolbar.find(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        (item as { readonly degraded?: unknown }).degraded === true,
    );

    expect(isViewportToolbarItem(degradedItem)).toBe(true);
    expect(degradedItem).toMatchObject({
      disabled: true,
      degraded: true,
      degradedReason: 'control-disconnected',
    });
    expect(
      isViewportToolbarItem({
        ...(degradedItem as Record<string, unknown>),
        degradedReason: 'surprise',
      }),
    ).toBe(false);
  });

  it('validates control-flow diagnostics for connection and metadata states', () => {
    expect(fixture.controlDiagnostics).toHaveLength(5);
    expect(fixture.controlDiagnostics.every(isViewportControlFlowDiagnostic)).toBe(true);

    const ackBeforeFrame = fixture.controlDiagnostics.find(
      (diagnostic) =>
        typeof diagnostic === 'object' &&
        diagnostic !== null &&
        (diagnostic as { readonly code?: unknown }).code === 'ack-before-frame',
    );
    expect(isViewportControlFlowDiagnostic(ackBeforeFrame)).toBe(true);
    expect(
      isViewportControlFlowDiagnostic({
        ...(ackBeforeFrame as Record<string, unknown>),
        metadataState: 'surprise',
      }),
    ).toBe(false);
    expect(fixture.controlDiagnostics.map((diagnostic) => readDiagnosticCode(diagnostic))).toEqual(
      expect.arrayContaining([
        'render-frame-meta-delayed',
        'render-frame-meta-stale',
        'scene-command-rejected',
      ]),
    );
  });

  it('defines a scene-control metadata event contract for the P1 migration path', () => {
    expect(isViewportMetadataEvent(fixture.metadataEvent)).toBe(true);
    expect(fixture.metadataEvent).toMatchObject({
      type: 'viewportMetadata',
      transport: 'scene-control',
      cadence: 'ack-correlated',
      revision: 11,
      appliedSeq: 42,
      meta: {
        revision: 11,
        appliedSeq: 42,
        viewTransform: [1, 0, 0, 1, 0, 0],
      },
    });
    expect(
      isViewportMetadataEvent({
        ...(fixture.metadataEvent as Record<string, unknown>),
        transport: 'websocket-sideband',
      }),
    ).toBe(false);
  });

  it('rejects non-serializable payload data before commands reach domain handlers', () => {
    const nonSerializableCommand = {
      ...fixture.command,
      payload: {
        ok: true,
        bad: Number.NaN,
      },
    };

    expect(isViewportCommand(nonSerializableCommand)).toBe(false);
    expect(isViewportSerializableValue({ ok: ['yes', 1, null] })).toBe(true);
    expect(isViewportSerializableValue({ bad: undefined })).toBe(false);
  });

  it('allows per-domain payload guard registration without importing domain implementations', () => {
    const registry = createViewportPayloadGuardRegistry();
    registry.register('scene', 'scene:puppet:dragBone', isDragBonePayload);

    expect(isViewportCommand(fixture.sceneCommand)).toBe(true);
    const sceneCommand = fixture.sceneCommand as ViewportCommand;
    expect(validateViewportCommandPayload(sceneCommand, registry)).toBe(true);
    expect(
      validateViewportCommandPayload(
        {
          ...sceneCommand,
          payload: { boneId: 'bone-head' },
        },
        registry,
      ),
    ).toBe(false);
  });
});

function isDragBonePayload(value: unknown): value is ViewportSerializableRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload['boneId'] === 'string' &&
    Array.isArray(payload['delta']) &&
    payload['delta'].length === 2 &&
    payload['delta'].every((item) => typeof item === 'number')
  );
}

function readDiagnosticCode(value: unknown): string | undefined {
  return typeof value === 'object' && value !== null
    ? (value as { readonly code?: string }).code
    : undefined;
}
