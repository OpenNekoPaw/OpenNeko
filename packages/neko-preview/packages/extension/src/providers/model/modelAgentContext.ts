import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  MODEL_PREVIEW_CONTEXT_VERSION,
  createResourceFingerprint,
  createResourceRef,
  isModelPreviewContextData,
  type AgentContextPayload,
  type ModelPreviewCaptureResult,
  type ModelPreviewContextData,
  type ModelPreviewSourceDescriptor,
  type ResourceRef,
} from '@neko/shared';
import { ModelSourceInspectionError } from './modelSourceInspection';
import type { ModelPreviewCaptureDeliveryInput } from './ModelPreviewProvider';

const MAX_MODEL_PREVIEW_CAPTURE_BYTES = 16 * 1024 * 1024;

export interface ModelPreviewCaptureFileSystem {
  mkdir(directory: string): Promise<void>;
  writeFile(filePath: string, bytes: Uint8Array): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  rm(filePath: string): Promise<void>;
}

export async function materializeModelPreviewCapture(input: {
  readonly workspaceRoot: string;
  readonly source: ModelPreviewSourceDescriptor;
  readonly capture: ModelPreviewCaptureResult;
  readonly fileSystem?: ModelPreviewCaptureFileSystem;
}): Promise<ResourceRef> {
  validateCaptureProjection(input.source, input.capture);
  const bytes = decodePngDataUrl(input.capture.dataUrl);
  validatePng(bytes, input.capture.metadata.width, input.capture.metadata.height);
  const captureHash = createHash('sha256').update(bytes).digest('hex');
  const assetId = `model-preview-${input.source.sourceFingerprint.slice(0, 16)}-${input.capture.metadata.revision}-${captureHash.slice(0, 12)}`;
  const relativePath = path.join(
    '.neko',
    '.cache',
    'model-preview',
    input.source.sourceFingerprint.slice(0, 16),
    `${assetId}.png`,
  );
  const absolutePath = path.join(input.workspaceRoot, relativePath);
  const temporaryPath = `${absolutePath}.tmp`;
  const fileSystem = input.fileSystem ?? NODE_CAPTURE_FILE_SYSTEM;
  await fileSystem.mkdir(path.dirname(absolutePath));
  try {
    await fileSystem.writeFile(temporaryPath, bytes);
    await fileSystem.rename(temporaryPath, absolutePath);
  } catch (error) {
    await fileSystem.rm(temporaryPath);
    throw error;
  }
  const portablePath = `\${WORKSPACE}/${relativePath.replaceAll('\\', '/')}`;
  return createResourceRef({
    scope: 'project',
    provider: 'model-preview-capture',
    kind: 'preview',
    source: {
      kind: 'file',
      projectRelativePath: relativePath.replaceAll('\\', '/'),
      uri: portablePath,
      identity: { sizeBytes: bytes.byteLength, hash: captureHash },
      metadata: { rebuildable: true, mimeType: 'image/png' },
    },
    locator: { kind: 'file', path: portablePath },
    fingerprint: createResourceFingerprint({ strategy: 'hash', value: captureHash }),
  });
}

export function buildModelPreviewContextPayload(input: {
  readonly source: ModelPreviewSourceDescriptor;
  readonly capture: ModelPreviewCaptureResult;
  readonly previewImage: ResourceRef;
}): AgentContextPayload {
  validateCaptureProjection(input.source, input.capture);
  const data: ModelPreviewContextData = {
    contractVersion: MODEL_PREVIEW_CONTEXT_VERSION,
    source: input.source.source,
    sourceFingerprint: input.source.sourceFingerprint,
    format: input.source.format,
    facts: input.capture.facts,
    staging: input.capture.staging,
    previewImage: input.previewImage,
    capture: input.capture.metadata,
  };
  if (!isModelPreviewContextData(data)) {
    throw new ModelSourceInspectionError({
      code: 'context-invalid',
      message: 'Model Preview context does not describe one consistent live projection.',
      severity: 'error',
      identity: input.capture.metadata,
    });
  }
  return {
    type: 'model-preview',
    id: `model-preview:${input.source.sourceFingerprint}:${input.capture.metadata.revision}`,
    label: modelSourceLabel(input.source.source),
    summary: `${input.source.format.toUpperCase()} model · ${data.facts.meshCount} meshes · staged camera ${data.staging.activeCameraId}`,
    data,
    intent: 'Use this staged 3D model view as visual and semantic reference.',
  };
}

export class ModelAgentContextBridge {
  constructor(
    private readonly dependencies: {
      readonly materialize?: typeof materializeModelPreviewCapture;
      readonly getCommands?: () => Promise<readonly string[]>;
      readonly executeCommand?: (command: string, payload: AgentContextPayload) => Promise<unknown>;
    } = {},
  ) {}

  async deliver(input: ModelPreviewCaptureDeliveryInput): Promise<void> {
    if (!input.workspaceRoot) {
      throw new ModelSourceInspectionError({
        code: 'context-invalid',
        message:
          'Sending Model Preview context requires an open workspace for rebuildable capture storage.',
        severity: 'error',
        identity: input.capture.metadata,
      });
    }
    const previewImage = await (this.dependencies.materialize ?? materializeModelPreviewCapture)({
      workspaceRoot: input.workspaceRoot,
      source: input.source,
      capture: input.capture,
    });
    const payload = buildModelPreviewContextPayload({
      source: input.source,
      capture: input.capture,
      previewImage,
    });
    const commands = await (
      this.dependencies.getCommands ?? (() => vscode.commands.getCommands(true))
    )();
    if (!commands.includes('neko.agent.sendContext')) {
      throw new ModelSourceInspectionError({
        code: 'agent-unavailable',
        message: 'Neko Agent is unavailable. The staged view remains ready to retry.',
        severity: 'error',
        identity: input.capture.metadata,
      });
    }
    try {
      await (
        this.dependencies.executeCommand ??
        ((command, commandPayload) => vscode.commands.executeCommand(command, commandPayload))
      )('neko.agent.sendContext', payload);
    } catch (error) {
      throw new ModelSourceInspectionError({
        code: 'agent-rejected',
        message: `Neko Agent rejected the Model Preview context: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error',
        identity: input.capture.metadata,
      });
    }
  }
}

function validateCaptureProjection(
  source: ModelPreviewSourceDescriptor,
  capture: ModelPreviewCaptureResult,
): void {
  if (
    capture.metadata.width < 64 ||
    capture.metadata.height < 64 ||
    capture.metadata.width > 2048 ||
    capture.metadata.height > 2048 ||
    capture.metadata.sourceFingerprint !== source.sourceFingerprint ||
    capture.staging.sourceFingerprint !== source.sourceFingerprint ||
    capture.metadata.sessionId !== capture.staging.sessionId ||
    capture.metadata.revision !== capture.staging.revision ||
    capture.metadata.cameraId !== capture.staging.activeCameraId
  ) {
    throw new ModelSourceInspectionError({
      code: 'context-invalid',
      message: 'Model Preview capture identity is inconsistent with its live source and staging.',
      severity: 'error',
      identity: capture.metadata,
    });
  }
}

function decodePngDataUrl(dataUrl: string): Uint8Array {
  const prefix = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefix)) {
    throw captureError('Model Preview capture must be a base64 PNG data URL.');
  }
  const encoded = dataUrl.slice(prefix.length);
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw captureError('Model Preview capture contains invalid base64 data.');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_MODEL_PREVIEW_CAPTURE_BYTES) {
    throw captureError('Model Preview capture exceeds the materialization size limit.');
  }
  return bytes;
}

function validatePng(bytes: Uint8Array, width: number, height: number): void {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.byteLength < 24 || !signature.every((value, index) => bytes[index] === value)) {
    throw captureError('Model Preview capture does not contain a valid PNG header.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(16) !== width || view.getUint32(20) !== height) {
    throw captureError('Model Preview capture dimensions do not match its metadata.');
  }
}

function captureError(message: string): ModelSourceInspectionError {
  return new ModelSourceInspectionError({ code: 'capture-invalid', message, severity: 'error' });
}

function modelSourceLabel(source: ResourceRef): string {
  const portablePath = source.source.projectRelativePath ?? source.source.uri;
  if (!portablePath) return '3D model';
  const normalized = portablePath.replaceAll('\\', '/');
  return normalized.split('/').at(-1) ?? '3D model';
}

const NODE_CAPTURE_FILE_SYSTEM: ModelPreviewCaptureFileSystem = {
  mkdir(directory) {
    return fs.mkdir(directory, { recursive: true }).then(() => undefined);
  },
  writeFile(filePath, bytes) {
    return fs.writeFile(filePath, bytes);
  },
  rename(from, to) {
    return fs.rename(from, to);
  },
  rm(filePath) {
    return fs.rm(filePath, { force: true });
  },
};
