import { describe, expect, it } from 'vitest';
import {
  createProjectTemplateHandoffIntent,
  parseProjectTemplateHandoffIntent,
} from '../project-template-handoff';

const binding = {
  kind: 'authoring' as const,
  workspaceId: 'workspace-1',
  workspaceGrantId: 'grant-1',
  authority: { kind: 'project' as const, projectId: 'project-1' },
  target: null,
};

describe('Project template handoff contract', () => {
  it.each(['storyboard', 'video-plan'] as const)('round-trips the %s template', (template) => {
    const intent = createProjectTemplateHandoffIntent({
      intentId: `intent:${template}`,
      template,
      label: 'Project One',
      binding,
    });

    expect(parseProjectTemplateHandoffIntent(intent)).toEqual(intent);
  });

  it('rejects unknown templates and target-level bindings', () => {
    expect(() =>
      parseProjectTemplateHandoffIntent({
        kind: 'project-template',
        intentId: 'intent-1',
        template: 'character-kit',
        label: 'Project One',
        binding,
      }),
    ).toThrow("Project template 'character-kit' is unsupported.");
    expect(() =>
      parseProjectTemplateHandoffIntent({
        kind: 'project-template',
        intentId: 'intent-1',
        template: 'storyboard',
        label: 'Project One',
        binding: {
          ...binding,
          target: { kind: 'world-project', worldProjectId: 'world-1' },
        },
      }),
    ).toThrow('Project template handoff requires an exact Project authoring binding.');
  });
});
