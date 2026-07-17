export const RECORDING_PROMOTION_COMMAND = 'neko.assets.promoteRecording';

export type RecordingArtifactProducer = 'neko-live' | 'neko-audio';
export type RecordingArtifactMediaType = 'video' | 'audio';
export type RecordingPromotionCopyMode = 'copy-preview' | 'already-durable';

export interface RecordingPromotionRequest {
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly workspaceRoot: string;
  readonly sourceRecordingId: string;
  readonly producer: RecordingArtifactProducer;
  readonly mediaType: RecordingArtifactMediaType;
  readonly recordedAt: number;
  readonly copyMode: RecordingPromotionCopyMode;
}

export interface RecordingProjectFactProvenance {
  readonly sourceRecordingId: string;
  readonly producer: RecordingArtifactProducer;
  readonly recordedAt: number;
  readonly sourceAuthority: 'preview-recording';
}

export interface RecordingProjectFactInput {
  readonly destinationPath: string;
  readonly mediaType: RecordingArtifactMediaType;
  readonly provenance: RecordingProjectFactProvenance;
}

export interface RecordingProjectFactRef {
  readonly entityId: string;
  readonly variantId: string;
  readonly fileId: string;
  readonly storedPath: string;
}

export interface RecordingPromotionResult {
  readonly destinationPath: string;
  readonly projectFact: RecordingProjectFactRef;
  readonly provenance: RecordingProjectFactProvenance;
}

export function isRecordingPromotionRequest(value: unknown): value is RecordingPromotionRequest {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['sourcePath']) &&
    isNonEmptyString(value['destinationPath']) &&
    isNonEmptyString(value['workspaceRoot']) &&
    isNonEmptyString(value['sourceRecordingId']) &&
    (value['producer'] === 'neko-live' || value['producer'] === 'neko-audio') &&
    (value['mediaType'] === 'video' || value['mediaType'] === 'audio') &&
    typeof value['recordedAt'] === 'number' &&
    Number.isFinite(value['recordedAt']) &&
    (value['copyMode'] === 'copy-preview' || value['copyMode'] === 'already-durable')
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
