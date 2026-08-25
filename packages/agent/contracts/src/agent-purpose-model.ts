import type { ModelType } from '@neko/ai-contracts';

export interface AgentPurposeModelRef<Category extends ModelType = ModelType> {
  readonly providerId: string;
  readonly modelId: string;
  readonly category: Category;
  readonly providerExpressionProfileId?: string;
}

export interface AgentFlatPurposeModelRefMap {
  readonly 'image.generate': AgentPurposeModelRef<'image'>;
  readonly 'image.edit': AgentPurposeModelRef<'image'>;
  readonly 'video.generate': AgentPurposeModelRef<'video'>;
  readonly 'audio.generate': AgentPurposeModelRef<'audio'>;
  readonly 'audio.tts': AgentPurposeModelRef<'audio'>;
  readonly 'audio.music.generate': AgentPurposeModelRef<'audio'>;
}

export type AgentFlatPurposeModelRefs = Partial<AgentFlatPurposeModelRefMap>;

export function parseAgentFlatPurposeModelRefs(value: unknown): AgentFlatPurposeModelRefs {
  const record = requireRecord(value);
  const selections: {
    -readonly [Purpose in keyof AgentFlatPurposeModelRefMap]?: AgentFlatPurposeModelRefMap[Purpose];
  } = {};
  for (const purpose of Object.keys(record)) {
    const category = purposeModelCategory(purpose);
    if (!category) throw new Error(`Unknown Agent model purpose '${purpose}'.`);
    const model = parsePurposeModelRef(record[purpose], category);
    switch (purpose) {
      case 'image.generate':
        selections['image.generate'] = model as AgentPurposeModelRef<'image'>;
        break;
      case 'image.edit':
        selections['image.edit'] = model as AgentPurposeModelRef<'image'>;
        break;
      case 'video.generate':
        selections['video.generate'] = model as AgentPurposeModelRef<'video'>;
        break;
      case 'audio.generate':
        selections['audio.generate'] = model as AgentPurposeModelRef<'audio'>;
        break;
      case 'audio.tts':
        selections['audio.tts'] = model as AgentPurposeModelRef<'audio'>;
        break;
      case 'audio.music.generate':
        selections['audio.music.generate'] = model as AgentPurposeModelRef<'audio'>;
        break;
    }
  }
  if (Object.keys(selections).length === 0) {
    throw new Error('Agent purpose model bindings must not be empty.');
  }
  return selections;
}

function parsePurposeModelRef(value: unknown, expectedCategory: ModelType): AgentPurposeModelRef {
  const record = requireRecord(value);
  if (!isNonEmptyString(record['providerId']) || !isNonEmptyString(record['modelId'])) {
    throw new Error('Agent purpose model provider and model identities are required.');
  }
  if (record['category'] !== expectedCategory) {
    throw new Error(
      `Agent purpose model category must be '${expectedCategory}', received '${String(record['category'])}'.`,
    );
  }
  const expressionProfile = record['providerExpressionProfileId'];
  if (expressionProfile !== undefined && !isNonEmptyString(expressionProfile)) {
    throw new Error('Agent purpose model expression profile identity must be non-empty.');
  }
  return {
    providerId: record['providerId'],
    modelId: record['modelId'],
    category: expectedCategory,
    ...(expressionProfile === undefined ? {} : { providerExpressionProfileId: expressionProfile }),
  };
}

function purposeModelCategory(value: string): ModelType | undefined {
  if (value === 'image.generate' || value === 'image.edit') return 'image';
  if (value === 'video.generate') return 'video';
  if (value === 'audio.generate' || value === 'audio.tts' || value === 'audio.music.generate') {
    return 'audio';
  }
  return undefined;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Agent purpose model bindings must be an object.');
  }
  return value as Record<string, unknown>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
