import { describe, expect, it } from 'vitest';
import liveCompositorFixture from '../__fixtures__/live-compositor-scene-v1.json';
import {
  createLiveCompositorPayloadGuardRegistry,
  isLiveCompositorCommandPayload,
  isLiveCompositorLatencySample,
  isLiveCompositorScene,
  isLiveCompositorSetOutputRoutePayload,
  isLiveCompositorUpdateLayerPayload,
  isLiveOutputRoute,
  LIVE_COMPOSITOR_COMMAND_ACTIONS,
  LIVE_COMPOSITOR_CONTRACT_VERSION,
  type LiveCompositorDiagnostic,
  type LiveCompositorScene,
} from '../live-compositor';
import {
  isViewportCommand,
  validateViewportCommandPayload,
  VIEWPORT_PROTOCOL_VERSION,
  type ViewportCommand,
} from '../viewport-protocol';

interface FixtureShape {
  readonly scene: unknown;
  readonly commands: {
    readonly setPreset: unknown;
    readonly updateLayer: unknown;
    readonly reorderLayer: unknown;
    readonly setTrackingOverlay: unknown;
    readonly setOutputRoute: unknown;
  };
}

function expectJsonSerializable(value: unknown): void {
  expect(JSON.parse(JSON.stringify(value))).toEqual(value);
}

function liveCommand(action: string, payload: unknown): ViewportCommand {
  return {
    protocolVersion: VIEWPORT_PROTOCOL_VERSION,
    domain: 'scene',
    action,
    sceneId: 'live-scene-main',
    viewportId: 'viewport-live-main',
    seq: 70,
    correlationId: `corr-${action}`,
    timestamp: 1810814400010,
    source: 'user',
    baseRevision: 12,
    payload: payload as ViewportCommand['payload'],
  };
}

describe('live compositor L0 contracts', () => {
  const fixture = liveCompositorFixture as FixtureShape;

  it('validates live compositor scene fixtures as serializable DTO data', () => {
    expect(LIVE_COMPOSITOR_CONTRACT_VERSION).toBe(1);
    expect(isLiveCompositorScene(fixture.scene)).toBe(true);
    expectJsonSerializable(fixture);
  });

  it('keeps stable ids for layer, source, preset, and output route references', () => {
    expect(isLiveCompositorScene(fixture.scene)).toBe(true);
    const scene = fixture.scene as LiveCompositorScene;

    const sourceIds = new Set(scene.sources.map((source) => source.sourceId));
    for (const layer of scene.layers) {
      expect(layer.id).toMatch(/^layer-/);
      expect(sourceIds.has(layer.source.sourceId)).toBe(true);
    }

    expect(scene.presets[0]?.layerIds).toContain('layer-puppet');
    expect(scene.outputRoutes.some((route) => route.id === 'route-monitor')).toBe(true);
  });

  it('validates layer command payloads and rejects malformed patches', () => {
    expect(isLiveCompositorUpdateLayerPayload(fixture.commands.updateLayer)).toBe(true);
    expect(
      isLiveCompositorUpdateLayerPayload({
        layerId: 'layer-puppet',
        patch: {},
      }),
    ).toBe(false);
    expect(
      isLiveCompositorUpdateLayerPayload({
        layerId: 'layer-puppet',
        patch: { opacity: 2 },
      }),
    ).toBe(false);
  });

  it('validates output routes, unsupported diagnostics, and latency samples', () => {
    expect(isLiveCompositorScene(fixture.scene)).toBe(true);
    const scene = fixture.scene as LiveCompositorScene;

    const recordingRoute = scene.outputRoutes.find((route) => route.id === 'route-recording');
    expect(isLiveOutputRoute(recordingRoute)).toBe(true);
    expect(recordingRoute?.status).toBe('unsupported');

    const unsupportedDiagnostic = scene.diagnostics.find(
      (diagnostic) => diagnostic.code === 'unsupported-source',
    ) as LiveCompositorDiagnostic | undefined;
    expect(unsupportedDiagnostic?.sourceKind).toBe('model');
    expect(scene.latencySamples.every((sample) => isLiveCompositorLatencySample(sample))).toBe(
      true,
    );
    expect(scene.latencySamples.some((sample) => sample.kind === 'command-to-frame')).toBe(true);
  });

  it('registers scene:live:* payload guards without changing the generic viewport protocol', () => {
    const registry = createLiveCompositorPayloadGuardRegistry();
    const command = liveCommand(
      LIVE_COMPOSITOR_COMMAND_ACTIONS.updateLayer,
      fixture.commands.updateLayer,
    );

    expect(isViewportCommand(command)).toBe(true);
    expect(validateViewportCommandPayload(command, registry)).toBe(true);
    expect(
      validateViewportCommandPayload(
        {
          ...command,
          payload: {
            layerId: 'layer-puppet',
            patch: { opacity: 2 },
          },
        },
        registry,
      ),
    ).toBe(false);
  });

  it('validates every first-pass scene:live command payload shape', () => {
    expect(
      isLiveCompositorCommandPayload(
        LIVE_COMPOSITOR_COMMAND_ACTIONS.setPreset,
        fixture.commands.setPreset,
      ),
    ).toBe(true);
    expect(
      isLiveCompositorCommandPayload(
        LIVE_COMPOSITOR_COMMAND_ACTIONS.reorderLayer,
        fixture.commands.reorderLayer,
      ),
    ).toBe(true);
    expect(
      isLiveCompositorCommandPayload(
        LIVE_COMPOSITOR_COMMAND_ACTIONS.setTrackingOverlay,
        fixture.commands.setTrackingOverlay,
      ),
    ).toBe(true);
    expect(isLiveCompositorSetOutputRoutePayload(fixture.commands.setOutputRoute)).toBe(true);
  });
});
