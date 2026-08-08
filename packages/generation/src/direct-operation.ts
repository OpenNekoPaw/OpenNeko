import type { GeneratedOutputContentLocator } from '@neko/content';

export type DirectGenerationMediaKind = 'image' | 'video' | 'audio';
export type DirectGenerationPurpose = 'image.generate' | 'video.generate' | 'audio.generate';

interface DirectGenerationOperationInputBase {
  readonly prompt: string;
  readonly providerId: string;
  readonly modelId: string;
}

export type DirectGenerationOperationInput =
  | (DirectGenerationOperationInputBase & {
      readonly mediaKind: 'image';
      readonly aspectRatio?: string;
      readonly width?: number;
      readonly height?: number;
    })
  | (DirectGenerationOperationInputBase & {
      readonly mediaKind: 'video';
      readonly aspectRatio?: string;
      readonly resolution?: string;
      readonly duration?: number;
      readonly fps?: number;
    })
  | (DirectGenerationOperationInputBase & {
      readonly mediaKind: 'audio';
      readonly duration?: number;
      readonly audioType?: 'sfx' | 'ambient' | 'voice';
    });

export type DirectGenerationOperationPhase =
  'succeeded' | 'failed' | 'cancelled' | 'outcome-unknown';

export interface DirectGenerationOperationProjection {
  readonly jobId: string;
  readonly mediaKind: DirectGenerationMediaKind;
  readonly purpose: DirectGenerationPurpose;
  readonly providerId: string;
  readonly modelId: string;
  readonly phase: DirectGenerationOperationPhase;
  readonly resultLocators: readonly GeneratedOutputContentLocator[];
  readonly diagnostic?: {
    readonly code: string;
    readonly message: string;
    readonly retryable?: boolean;
  };
}

export interface DirectGenerationOperationPort {
  submit(input: DirectGenerationOperationInput): Promise<DirectGenerationOperationProjection>;
}

export class DirectGenerationOperationContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DirectGenerationOperationContractError';
  }
}

export function parseDirectGenerationOperationInput(
  value: unknown,
): DirectGenerationOperationInput {
  const record = requireRecord(value, 'Direct Generation operation must be an object.');
  const mediaKind = requireMediaKind(record['mediaKind']);
  const base = {
    mediaKind,
    prompt: requireNonEmptyString(record['prompt'], 'Direct Generation prompt is required.'),
    providerId: requireNonEmptyString(
      record['providerId'],
      'Direct Generation provider identity is required.',
    ),
    modelId: requireNonEmptyString(
      record['modelId'],
      'Direct Generation model identity is required.',
    ),
  };
  if (mediaKind === 'image') {
    requireExactKeys(record, [
      'mediaKind',
      'prompt',
      'providerId',
      'modelId',
      ...optionalKeys(record, ['aspectRatio', 'width', 'height']),
    ]);
    return {
      ...base,
      mediaKind,
      ...optionalString(record, 'aspectRatio'),
      ...optionalPositiveNumber(record, 'width'),
      ...optionalPositiveNumber(record, 'height'),
    };
  }
  if (mediaKind === 'video') {
    requireExactKeys(record, [
      'mediaKind',
      'prompt',
      'providerId',
      'modelId',
      ...optionalKeys(record, ['aspectRatio', 'resolution', 'duration', 'fps']),
    ]);
    return {
      ...base,
      mediaKind,
      ...optionalString(record, 'aspectRatio'),
      ...optionalString(record, 'resolution'),
      ...optionalPositiveNumber(record, 'duration'),
      ...optionalPositiveNumber(record, 'fps'),
    };
  }
  requireExactKeys(record, [
    'mediaKind',
    'prompt',
    'providerId',
    'modelId',
    ...optionalKeys(record, ['duration', 'audioType']),
  ]);
  const audioType = record['audioType'];
  if (
    audioType !== undefined &&
    audioType !== 'sfx' &&
    audioType !== 'ambient' &&
    audioType !== 'voice'
  ) {
    throw new DirectGenerationOperationContractError(
      'Direct Generation audio type must be sfx, ambient, or voice.',
    );
  }
  return {
    ...base,
    mediaKind,
    ...optionalPositiveNumber(record, 'duration'),
    ...(audioType === undefined ? {} : { audioType }),
  };
}

export function parseDirectGenerationOperationProjection(
  value: unknown,
): DirectGenerationOperationProjection {
  const record = requireRecord(value, 'Direct Generation projection must be an object.');
  requireExactKeys(record, [
    'jobId',
    'mediaKind',
    'purpose',
    'providerId',
    'modelId',
    'phase',
    'resultLocators',
    ...optionalKeys(record, ['diagnostic']),
  ]);
  const mediaKind = requireMediaKind(record['mediaKind']);
  const purpose = requirePurpose(record['purpose']);
  if (purpose !== purposeForMediaKind(mediaKind)) {
    throw new DirectGenerationOperationContractError(
      'Direct Generation purpose does not match its media kind.',
    );
  }
  const phase = requirePhase(record['phase']);
  const resultLocators = requireResultLocators(record['resultLocators']);
  if (phase === 'succeeded' && resultLocators.length === 0) {
    throw new DirectGenerationOperationContractError(
      'Succeeded Direct Generation requires at least one result locator.',
    );
  }
  const diagnostic = parseDiagnostic(record['diagnostic']);
  if (phase !== 'succeeded' && !diagnostic) {
    throw new DirectGenerationOperationContractError(
      `Direct Generation phase '${phase}' requires a diagnostic.`,
    );
  }
  return {
    jobId: requireNonEmptyString(record['jobId'], 'Direct Generation Job identity is required.'),
    mediaKind,
    purpose,
    providerId: requireNonEmptyString(
      record['providerId'],
      'Direct Generation provider identity is required.',
    ),
    modelId: requireNonEmptyString(
      record['modelId'],
      'Direct Generation model identity is required.',
    ),
    phase,
    resultLocators,
    ...(diagnostic === undefined ? {} : { diagnostic }),
  };
}

export function purposeForMediaKind(mediaKind: DirectGenerationMediaKind): DirectGenerationPurpose {
  switch (mediaKind) {
    case 'image':
      return 'image.generate';
    case 'video':
      return 'video.generate';
    case 'audio':
      return 'audio.generate';
  }
}

function requireMediaKind(value: unknown): DirectGenerationMediaKind {
  if (value !== 'image' && value !== 'video' && value !== 'audio') {
    throw new DirectGenerationOperationContractError(
      'Direct Generation media kind must be image, video, or audio.',
    );
  }
  return value;
}

function requirePurpose(value: unknown): DirectGenerationPurpose {
  if (value !== 'image.generate' && value !== 'video.generate' && value !== 'audio.generate') {
    throw new DirectGenerationOperationContractError('Direct Generation purpose is invalid.');
  }
  return value;
}

function requirePhase(value: unknown): DirectGenerationOperationPhase {
  if (
    value !== 'succeeded' &&
    value !== 'failed' &&
    value !== 'cancelled' &&
    value !== 'outcome-unknown'
  ) {
    throw new DirectGenerationOperationContractError('Direct Generation phase is invalid.');
  }
  return value;
}

function requireResultLocators(value: unknown): readonly GeneratedOutputContentLocator[] {
  if (!Array.isArray(value)) {
    throw new DirectGenerationOperationContractError(
      'Direct Generation result locators must be an array.',
    );
  }
  return value.map((entry) => {
    const record = requireRecord(entry, 'Generated output locator must be an object.');
    requireExactKeys(record, ['kind', 'outputId', 'digest', 'path']);
    if (record['kind'] !== 'generated-output') {
      throw new DirectGenerationOperationContractError(
        'Direct Generation result locator kind must be generated-output.',
      );
    }
    return {
      kind: 'generated-output',
      outputId: requireNonEmptyString(record['outputId'], 'Generated output identity is required.'),
      digest: requireNonEmptyString(record['digest'], 'Generated output digest is required.'),
      path: requireNonEmptyString(record['path'], 'Generated output path is required.'),
    };
  });
}

function parseDiagnostic(value: unknown): DirectGenerationOperationProjection['diagnostic'] {
  if (value === undefined) return undefined;
  const record = requireRecord(value, 'Direct Generation diagnostic must be an object.');
  requireExactKeys(record, ['code', 'message', ...optionalKeys(record, ['retryable'])]);
  const retryable = record['retryable'];
  if (retryable !== undefined && typeof retryable !== 'boolean') {
    throw new DirectGenerationOperationContractError(
      'Direct Generation diagnostic retryable flag must be boolean.',
    );
  }
  return {
    code: requireNonEmptyString(record['code'], 'Direct Generation diagnostic code is required.'),
    message: requireNonEmptyString(
      record['message'],
      'Direct Generation diagnostic message is required.',
    ),
    ...(retryable === undefined ? {} : { retryable }),
  };
}

function optionalString(
  record: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, string>> {
  const value = record[key];
  return value === undefined
    ? {}
    : { [key]: requireNonEmptyString(value, `Direct Generation ${key} is invalid.`) };
}

function optionalPositiveNumber(
  record: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, number>> {
  const value = record[key];
  if (value === undefined) return {};
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new DirectGenerationOperationContractError(
      `Direct Generation ${key} must be a positive number.`,
    );
  }
  return { [key]: value };
}

function optionalKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): string[] {
  return keys.filter((key) => key in record);
}

function requireRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DirectGenerationOperationContractError(message);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): void {
  const actual = Object.keys(record);
  if (actual.length !== expected.length || actual.some((key) => !expected.includes(key))) {
    throw new DirectGenerationOperationContractError(
      'Direct Generation contract contains unsupported fields.',
    );
  }
}

function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DirectGenerationOperationContractError(message);
  }
  return value;
}
