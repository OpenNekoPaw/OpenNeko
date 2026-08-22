import type { GenerationJobSnapshot, SubmitPurposeGenerationJobInput } from './job/contracts';
import { GENERATION_JOB_KIND } from './job/contracts';
import { decodeSubmitPurposeGenerationJobInput } from './job/codec';
import {
  IMAGE_OPERATION_IDS,
  VIDEO_OPERATION_IDS,
} from './domain-contracts/creative-media-operations';

export const GENERATION_DSH_TOOL_NAME = 'openneko.generation' as const;
export const GENERATION_DSH_TOOL_OPERATIONS = ['submit', 'describe'] as const;

export type GenerationDshToolOperation = (typeof GENERATION_DSH_TOOL_OPERATIONS)[number];

const CONTENT_LOCATOR_SCHEMA = {
  type: 'object',
  description:
    'Canonical @neko/content ContentLocator supplied by product context. Its owning validator checks the kind-specific fields.',
  properties: {
    kind: {
      type: 'string',
      enum: ['workspace-file', 'document-entry', 'generated-output', 'package-resource'],
      required: true,
    },
  },
  additionalProperties: true,
} as const;

const IP_ADAPTER_REFERENCE_SCHEMA = {
  type: 'object',
  properties: {
    imageLocator: { ...CONTENT_LOCATOR_SCHEMA, required: true },
    mimeType: { type: 'string' },
    strength: { type: 'number' },
    mode: { type: 'string', enum: ['style', 'subject', 'both'] },
  },
  additionalProperties: false,
} as const;

const THREE_REFERENCE_IDENTITY_SCHEMA = {
  type: 'object',
  properties: {
    sessionId: { type: 'string', required: true },
    requestId: { type: 'string', required: true },
  },
  additionalProperties: false,
} as const;

const VECTOR3_SCHEMA = {
  type: 'object',
  properties: {
    x: { type: 'number', required: true },
    y: { type: 'number', required: true },
    z: { type: 'number', required: true },
  },
  additionalProperties: false,
} as const;

const IMAGE_REQUEST_SCHEMA = {
  type: 'object',
  title: 'image generation request',
  description:
    'Image request. Use camelCase fields such as negativePrompt and aspectRatio; provider and model bindings are Host-owned.',
  properties: {
    prompt: { type: 'string', required: true },
    negativePrompt: { type: 'string' },
    metadata: { type: 'object', additionalProperties: true },
    operation: { type: 'string', enum: [...IMAGE_OPERATION_IDS] },
    width: { type: 'number' },
    height: { type: 'number' },
    aspectRatio: { type: 'string' },
    count: { type: 'number' },
    referenceImageLocator: CONTENT_LOCATOR_SCHEMA,
    maskLocator: CONTENT_LOCATOR_SCHEMA,
    inpaintStrength: { type: 'number' },
    quality: { type: 'string', enum: ['standard', 'hd'] },
    style: { type: 'string' },
    controlImageLocator: CONTENT_LOCATOR_SCHEMA,
    controlMode: {
      type: 'string',
      enum: ['canny', 'depth', 'pose', 'normal', 'segment', 'lineart', 'softedge', 'scribble'],
    },
    controlStrength: { type: 'number' },
    ipAdapterRefs: { type: 'array', items: IP_ADAPTER_REFERENCE_SCHEMA },
    cameraReference: {
      type: 'object',
      properties: {
        value: {
          type: 'object',
          properties: {
            cameraId: { type: 'string', required: true },
            position: { ...VECTOR3_SCHEMA, required: true },
            target: { ...VECTOR3_SCHEMA, required: true },
            fieldOfViewDeg: { type: 'number', required: true },
            aspectRatio: { type: 'number', required: true },
          },
          additionalProperties: false,
          required: true,
        },
        identity: { ...THREE_REFERENCE_IDENTITY_SCHEMA, required: true },
      },
      additionalProperties: false,
    },
    panoramaReference: {
      type: 'object',
      properties: {
        imageLocator: { ...CONTENT_LOCATOR_SCHEMA, required: true },
        orientation: {
          type: 'object',
          properties: {
            yawDeg: { type: 'number', required: true },
            pitchDeg: { type: 'number', required: true },
            fieldOfViewDeg: { type: 'number', required: true },
          },
          additionalProperties: false,
          required: true,
        },
        identity: { ...THREE_REFERENCE_IDENTITY_SCHEMA, required: true },
      },
      additionalProperties: false,
    },
    editInstruction: { type: 'string' },
    outpaintExpansion: {
      type: 'object',
      properties: {
        left: { type: 'number', required: true },
        right: { type: 'number', required: true },
        top: { type: 'number', required: true },
        bottom: { type: 'number', required: true },
        fillMode: {
          type: 'string',
          enum: ['generative', 'edge-extend', 'transparent'],
          required: true,
        },
      },
      additionalProperties: false,
    },
    splitOptions: {
      oneOf: [
        {
          type: 'object',
          properties: {
            profileId: { type: 'string', const: 'grid-crop', required: true },
            grid: {
              type: 'object',
              properties: {
                rows: { type: 'number', required: true },
                columns: { type: 'number', required: true },
                gapPixels: { type: 'number' },
                marginPixels: { type: 'number' },
              },
              additionalProperties: false,
              required: true,
            },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: {
            profileId: { type: 'string', const: 'comic-panel', required: true },
            comic: {
              type: 'object',
              properties: {
                readingOrder: {
                  type: 'string',
                  enum: ['left-to-right', 'right-to-left', 'top-to-bottom'],
                },
                includeBleed: { type: 'boolean' },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: {
            profileId: {
              type: 'string',
              const: 'semantic-segmentation',
              required: true,
            },
            segmentation: {
              type: 'object',
              properties: {
                labels: { type: 'array', items: { type: 'string' } },
                minimumConfidence: { type: 'number' },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      ],
    },
  },
  additionalProperties: false,
} as const;

const VIDEO_REQUEST_SCHEMA = {
  type: 'object',
  title: 'video generation request',
  description:
    'Video request. Use camelCase fields such as aspectRatio; provider and model bindings are Host-owned.',
  properties: {
    prompt: { type: 'string', required: true },
    negativePrompt: { type: 'string' },
    metadata: { type: 'object', additionalProperties: true },
    operation: { type: 'string', enum: [...VIDEO_OPERATION_IDS] },
    duration: { type: 'number' },
    resolution: { type: 'string' },
    fps: { type: 'number' },
    aspectRatio: { type: 'string' },
    startFrameLocator: CONTENT_LOCATOR_SCHEMA,
    endFrameLocator: CONTENT_LOCATOR_SCHEMA,
    referenceVideoLocator: CONTENT_LOCATOR_SCHEMA,
    motionStrength: { type: 'number' },
    cameraMovement: { type: 'string' },
    cameraAngle: { type: 'string' },
    shotScale: { type: 'string' },
    referenceImages: { type: 'array', items: IP_ADAPTER_REFERENCE_SCHEMA },
    editInstruction: { type: 'string' },
  },
  additionalProperties: false,
} as const;

const AUDIO_REQUEST_SCHEMA = {
  type: 'object',
  title: 'audio generation request',
  description: 'Audio request; provider and model bindings are Host-owned.',
  properties: {
    prompt: { type: 'string', required: true },
    negativePrompt: { type: 'string' },
    metadata: { type: 'object', additionalProperties: true },
    duration: { type: 'number' },
    isMusic: { type: 'boolean' },
    genre: { type: 'string' },
    format: { type: 'string', enum: ['mp3', 'wav', 'flac'] },
  },
  additionalProperties: false,
} as const;

const PROMPT_REQUEST_SCHEMA = {
  type: 'object',
  title: 'prompt generation request',
  description: 'Text prompt-generation request; provider and model bindings are Host-owned.',
  properties: {
    prompt: { type: 'string', required: true },
    context: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sourceNodeId: { type: 'string', required: true },
          text: { type: 'string', required: true },
          digest: { type: 'string', required: true },
        },
        additionalProperties: false,
      },
    },
    temperature: { type: 'number' },
    maxOutputTokens: { type: 'number' },
  },
  additionalProperties: false,
} as const;

const SUBMIT_PROPERTIES = {
  purpose: {
    type: 'string',
    description: 'Host-configured Generation purpose, for example image.generate.',
    required: true,
  },
  lifecycleMode: {
    type: 'string',
    enum: ['linked', 'detached'],
    description: 'Use detached for a durable background Job; linked follows the calling runtime.',
    required: true,
  },
} as const;

export const GENERATION_DSH_TOOL_PARAMETERS = {
  operation: {
    type: 'string',
    enum: [...GENERATION_DSH_TOOL_OPERATIONS],
    description: 'Use submit with a purpose-bound generation request; use describe with { jobId }.',
    required: true,
  },
  input: {
    oneOf: [
      {
        type: 'object',
        title: 'describe input',
        description: 'Input for the describe operation.',
        properties: { jobId: { type: 'string', required: true } },
        additionalProperties: false,
      },
      {
        type: 'object',
        title: 'prompt submit input',
        description: 'Input for submit when generationType is prompt.',
        properties: {
          ...SUBMIT_PROPERTIES,
          generationType: { type: 'string', const: 'prompt', required: true },
          request: { ...PROMPT_REQUEST_SCHEMA, required: true },
        },
        additionalProperties: false,
      },
      {
        type: 'object',
        title: 'image submit input',
        description: 'Input for submit when generationType creates or edits an image.',
        properties: {
          ...SUBMIT_PROPERTIES,
          generationType: {
            type: 'string',
            enum: ['text-to-image', 'image-to-image', 'image-edit'],
            required: true,
          },
          request: { ...IMAGE_REQUEST_SCHEMA, required: true },
        },
        additionalProperties: false,
      },
      {
        type: 'object',
        title: 'video submit input',
        description: 'Input for submit when generationType creates or edits a video.',
        properties: {
          ...SUBMIT_PROPERTIES,
          generationType: {
            type: 'string',
            enum: ['text-to-video', 'image-to-video', 'video-to-video', 'video-edit'],
            required: true,
          },
          request: { ...VIDEO_REQUEST_SCHEMA, required: true },
        },
        additionalProperties: false,
      },
      {
        type: 'object',
        title: 'audio submit input',
        description: 'Input for submit when generationType creates audio or music.',
        properties: {
          ...SUBMIT_PROPERTIES,
          generationType: {
            type: 'string',
            enum: ['text-to-audio', 'text-to-music'],
            required: true,
          },
          request: { ...AUDIO_REQUEST_SCHEMA, required: true },
        },
        additionalProperties: false,
      },
    ],
    required: true,
  },
} as const;

export type GenerationDshToolSubmitInput = SubmitPurposeGenerationJobInput;

export interface GenerationDshToolDescribeInput {
  readonly jobId: string;
}

export type GenerationDshToolInput =
  | {
      readonly operation: 'submit';
      readonly input: GenerationDshToolSubmitInput;
    }
  | {
      readonly operation: 'describe';
      readonly input: GenerationDshToolDescribeInput;
    };

export interface GenerationDshToolBoundedFacts {
  readonly jobId: string;
  readonly kind: typeof GENERATION_JOB_KIND;
  readonly phase: GenerationJobSnapshot['phase'];
  readonly stage: GenerationJobSnapshot['progress']['stage'];
  readonly lifecycleMode: GenerationJobSnapshot['lifecycleMode'];
  readonly generationType: GenerationJobSnapshot['request']['generationType'];
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly failure?: GenerationJobSnapshot['failure'];
  readonly resultLocators?: NonNullable<GenerationJobSnapshot['resultLocators']>;
}

export function decodeGenerationDshToolInput(
  operation: unknown,
  input: unknown,
): GenerationDshToolInput {
  if (operation === 'submit') {
    return { operation, input: decodeSubmitInput(input) };
  }
  if (operation === 'describe') {
    return { operation, input: decodeDescribeInput(input) };
  }
  throw new Error(
    `Generation DSH tool operation must be one of ${GENERATION_DSH_TOOL_OPERATIONS.join(', ')}.`,
  );
}

export function projectGenerationJobSnapshot(
  snapshot: GenerationJobSnapshot,
): GenerationDshToolBoundedFacts {
  return {
    jobId: snapshot.ref.jobId,
    kind: snapshot.ref.kind,
    phase: snapshot.phase,
    stage: snapshot.progress.stage,
    lifecycleMode: snapshot.lifecycleMode,
    generationType: snapshot.request.generationType,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    ...(snapshot.failure === undefined ? {} : { failure: snapshot.failure }),
    ...(snapshot.resultLocators === undefined ? {} : { resultLocators: snapshot.resultLocators }),
  };
}

function decodeSubmitInput(input: unknown): GenerationDshToolSubmitInput {
  return decodeSubmitPurposeGenerationJobInput(input);
}

function decodeDescribeInput(input: unknown): GenerationDshToolDescribeInput {
  const record = requireRecord(input, 'input');
  requireOnlyKeys(record, ['jobId'], 'input');
  return { jobId: requireNonEmptyString(record.jobId, 'input.jobId') };
}

function requireRecord(input: unknown, field: string): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`${field} must be an object.`);
  }
  return input as Record<string, unknown>;
}

function requireNonEmptyString(input: unknown, field: string): string {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return input;
}

function requireOnlyKeys(
  input: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
): void {
  const unknownKey = Object.keys(input).find((key) => !allowed.includes(key));
  if (unknownKey !== undefined) throw new Error(`${field}.${unknownKey} is not supported.`);
}
