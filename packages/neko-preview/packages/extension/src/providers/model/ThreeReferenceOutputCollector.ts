import {
  THREE_REFERENCE_CONTEXT_VERSION,
  isThreeReferenceContextData,
  type AgentContextPayload,
  type ResourceRef,
  type ThreeReferenceContextData,
  type ThreeReferenceOutput,
  type ThreeReferencePurpose,
} from '@neko/shared';
import type { ThreeReferenceCaptureRequest } from './ModelPreviewProvider';

export interface ThreeReferenceOutputCollectorDependencies {
  readonly materializeCapture: (request: ThreeReferenceCaptureRequest) => Promise<ResourceRef>;
  readonly deliverContext: (payload: AgentContextPayload) => Promise<void>;
}

interface PendingOutputs {
  readonly staging: ThreeReferenceCaptureRequest['staging'];
  readonly outputs: Map<ThreeReferencePurpose, ThreeReferenceOutput>;
}

export class ThreeReferenceOutputCollector {
  private readonly pending = new Map<string, PendingOutputs>();

  constructor(private readonly dependencies: ThreeReferenceOutputCollectorDependencies) {}

  async collect(request: ThreeReferenceCaptureRequest): Promise<void> {
    request.signal.throwIfAborted();
    const image = await this.dependencies.materializeCapture(request);
    request.signal.throwIfAborted();
    const key = `${request.identity.sessionId}:${request.identity.revision}`;
    const current = this.pending.get(key) ?? {
      staging: request.staging,
      outputs: new Map<ThreeReferencePurpose, ThreeReferenceOutput>(),
    };
    if (current.staging !== request.staging) {
      throw new Error('3D Reference output collection received divergent staging snapshots.');
    }
    current.outputs.set(request.purpose, projectOutput(request, image));
    this.pending.set(key, current);
    if (!request.staging.selectedPurposes.every((purpose) => current.outputs.has(purpose))) return;
    const outputs = request.staging.selectedPurposes.map((purpose) => {
      const output = current.outputs.get(purpose);
      if (!output) throw new Error(`3D Reference output is missing: ${purpose}`);
      return output;
    });
    const context: ThreeReferenceContextData = {
      contractVersion: THREE_REFERENCE_CONTEXT_VERSION,
      staging: request.staging,
      outputs,
    };
    if (!isThreeReferenceContextData(context)) {
      throw new Error('3D Reference output collection produced an invalid context.');
    }
    await this.dependencies.deliverContext({
      type: '3d-reference',
      id: `3d-reference:${request.identity.sessionId}:${request.identity.revision}`,
      label: labelFor(request),
      summary: request.staging.selectedPurposes.join(', '),
      data: context,
    });
    this.pending.delete(key);
  }
}

function projectOutput(
  request: ThreeReferenceCaptureRequest,
  image: ResourceRef,
): ThreeReferenceOutput {
  const identity = request.identity;
  switch (request.purpose) {
    case 'appearance':
      if (request.staging.subject.kind !== 'source-model') {
        throw new Error('Guide-only 3D Reference subjects cannot produce appearance output.');
      }
      return { ...identity, kind: 'appearance', image, source: request.staging.subject.source };
    case 'pose':
      if (!request.staging.pose) throw new Error('Pose output requires staged joint data.');
      return {
        ...identity,
        kind: 'pose',
        controlImage: image,
        controlMode: request.poseControlMode ?? 'pose',
        joints: request.staging.pose.joints,
      };
    case 'camera':
      return {
        ...identity,
        kind: 'camera',
        camera: request.staging.camera,
        compositionImage: image,
      };
    case 'panorama-scene':
      if (!request.staging.environment) {
        throw new Error('Panoramic-scene output requires a staged panorama environment.');
      }
      return {
        ...identity,
        kind: 'panorama-scene',
        panorama: request.staging.environment.source,
        orientation: request.staging.environment.orientation,
        viewportImage: image,
      };
  }
}

function labelFor(request: ThreeReferenceCaptureRequest): string {
  switch (request.staging.subject.kind) {
    case 'source-model':
      return '3D Reference';
    case 'builtin-preset':
      return request.staging.subject.presetId;
    case 'environment-only':
      return '3D Reference panorama';
  }
}
