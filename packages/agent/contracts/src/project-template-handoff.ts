import {
  parseAgentEntryTargetBinding,
  type AgentProjectAuthoringBinding,
} from './agent-entry-intent';

export const PROJECT_TEMPLATE_ENTRIES = ['storyboard', 'video-plan'] as const;

export type ProjectTemplateEntry = (typeof PROJECT_TEMPLATE_ENTRIES)[number];

export interface ProjectTemplateHandoffIntent {
  readonly kind: 'project-template';
  readonly intentId: string;
  readonly template: ProjectTemplateEntry;
  readonly label: string;
  readonly binding: AgentProjectAuthoringBinding;
}

export function createProjectTemplateHandoffIntent(input: {
  readonly intentId: string;
  readonly template: ProjectTemplateEntry;
  readonly label: string;
  readonly binding: AgentProjectAuthoringBinding;
}): ProjectTemplateHandoffIntent {
  return parseProjectTemplateHandoffIntent({ kind: 'project-template', ...input });
}

export function parseProjectTemplateHandoffIntent(value: unknown): ProjectTemplateHandoffIntent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Project template handoff must be an object.');
  }
  const record = value as Readonly<Record<string, unknown>>;
  const supported = new Set(['kind', 'intentId', 'template', 'label', 'binding']);
  if (
    Object.keys(record).length !== supported.size ||
    Object.keys(record).some((key) => !supported.has(key))
  ) {
    throw new Error('Project template handoff contains unsupported or missing fields.');
  }
  if (record['kind'] !== 'project-template') {
    throw new Error("Project template handoff kind must be 'project-template'.");
  }
  const template = record['template'];
  if (template !== 'storyboard' && template !== 'video-plan') {
    throw new Error(`Project template '${String(template)}' is unsupported.`);
  }
  const binding = parseAgentEntryTargetBinding(record['binding']);
  if (binding.kind !== 'authoring' || binding.target !== null) {
    throw new Error('Project template handoff requires an exact Project authoring binding.');
  }
  return {
    kind: 'project-template',
    intentId: requireIdentity(record['intentId'], 'Project template handoff'),
    template,
    label: requireIdentity(record['label'], 'Project template label'),
    binding,
  };
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value;
}
