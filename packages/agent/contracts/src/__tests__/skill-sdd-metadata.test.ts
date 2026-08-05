import { describe, expect, it } from 'vitest';
import {
  collectSkillProfileReferences,
  toConfiguredSkillCatalogEntry,
  toLazySkillCatalogEntry,
  toSkillCatalogEntry,
  validateSkill,
} from '../skill';
import type { Skill } from '../skill';

function baseSkill(overrides: Partial<Skill> = {}): Partial<Skill> {
  return {
    name: 'my-skill',
    description: 'Use when the user wants to exercise the validator surface.',
    content: '# my-skill\n\nSome persona content.',
    source: 'builtin',
    enabled: true,
    ...overrides,
  };
}

describe('validateSkill', () => {
  it('validates the canonical runtime projection', () => {
    expect(validateSkill(baseSkill())).toEqual({ valid: true, errors: [], warnings: [] });
    for (const name of ['Bad Name', '中文-skill', 'skill_name']) {
      expect(validateSkill(baseSkill({ name })).valid).toBe(false);
    }
    expect(validateSkill(baseSkill({ name: 'a'.repeat(65) })).valid).toBe(false);
    expect(validateSkill(baseSkill({ description: '', content: '' })).errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('description'),
        expect.stringContaining('content'),
      ]),
    );
  });

  it.each([
    'version',
    'domain',
    'requiredSubpackages',
    'autoInvoke',
    'referencedAssets',
    'referencedSkills',
    'compliance',
    'manifest',
  ])('rejects removed compatibility field %s', (field) => {
    const candidate = baseSkill();
    Reflect.set(candidate, field, field === 'version' ? '1.0.0' : {});

    expect(validateSkill(candidate)).toMatchObject({
      valid: false,
      errors: [`Unsupported Skill field: ${field}`],
    });
  });

  it('validates media workflow hints without executable workflow fields', () => {
    const valid = validateSkill(
      baseSkill({
        mediaWorkflow: {
          acceptedModalities: ['image'],
          producedArtifacts: ['StoryboardTable'],
          artifactProfiles: ['media-production.shot-image-prep'],
          referencedCapabilities: ['cut.importStoryboard'],
          suggestedProjectors: ['projector:storyboard-to-cut'],
          costLevel: 'medium',
          riskLevel: 'medium',
        },
      }),
    );
    expect(valid.valid).toBe(true);

    const invalid = baseSkill();
    Reflect.set(invalid, 'mediaWorkflow', {
      acceptedModalities: ['comic', ''],
      steps: ['inspect', 'structure'],
      routes: [{ from: 'comic', to: 'video' }],
      costLevel: 'expensive',
    });
    expect(validateSkill(invalid).errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('mediaWorkflow.steps is not allowed'),
        expect.stringContaining('mediaWorkflow.routes is not allowed'),
        'mediaWorkflow.acceptedModalities[1] must be a non-empty string',
        'mediaWorkflow.costLevel must be "free", "low", "medium", or "high"',
      ]),
    );
  });

  it('validates stable profile references without a profile version range', () => {
    expect(
      collectSkillProfileReferences({
        profileReferences: [
          {
            profileId: 'provider-expression:studio',
            kind: 'provider-expression',
            relationship: 'prefers',
          },
        ],
        mediaWorkflow: { artifactProfiles: ['media-production.shot-image-prep'] },
      }),
    ).toEqual([
      {
        profileId: 'provider-expression:studio',
        kind: 'provider-expression',
        relationship: 'prefers',
      },
      { profileId: 'media-production.shot-image-prep', kind: 'artifact', relationship: 'produces' },
    ]);

    const invalid = baseSkill();
    Reflect.set(invalid, 'profileReferences', [
      { profileId: '', kind: 'workflow', relationship: 'owns' },
    ]);
    expect(validateSkill(invalid).errors).toEqual(
      expect.arrayContaining([
        'profileReferences[0].profileId must be a non-empty string',
        'profileReferences[0].kind must be a supported Agent profile kind',
        'profileReferences[0].relationship must be "consumes", "produces", "requires", or "prefers"',
      ]),
    );
  });

  it('warns only when prompt text claims executable workflow semantics', () => {
    const executable = validateSkill(
      baseSkill({
        content: 'This skill defines a workflow DAG with executable nodes and runtime transitions.',
      }),
    );
    expect(executable.warnings).toEqual([
      expect.stringContaining('Skill prompt text appears to describe executable workflow'),
    ]);

    const guidance = validateSkill(
      baseSkill({
        content: 'This is prompt-chain guidance, not an executable workflow runtime or DAG.',
      }),
    );
    expect(guidance.warnings).toEqual([]);
  });

  it('rejects workflow DSL and invalid actions in Host catalog policy', () => {
    const candidate = baseSkill();
    Reflect.set(candidate, 'catalog', {
      role: 'pipeline',
      visibility: 'everyone',
      parentSkillIds: ['media-production', ''],
      steps: ['inspect'],
      actions: ['run', { id: 'edit', targetSource: 'builtin' }],
    });

    expect(validateSkill(candidate).errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('catalog.steps is not allowed'),
        expect.stringContaining('catalog.role must be one of'),
        expect.stringContaining('catalog.visibility must be one of'),
        'catalog.parentSkillIds[1] must be a non-empty string',
        'catalog.actions[1].targetSource must be "project" or "personal"',
      ]),
    );
  });
});

describe('skill catalog projection metadata', () => {
  it('projects provider-contributed skills with runtime-safe plugin defaults', () => {
    const entry = toSkillCatalogEntry(
      { name: 'plugin-skill', description: 'Plugin skill' },
      { command: 'plugin.runSkill', tags: ['plugin'] },
    );

    expect(entry.catalog).toMatchObject({
      role: 'standalone',
      source: 'plugin',
      visibility: 'primary',
      editable: false,
      actions: [{ id: 'run' }],
    });
  });

  it('does not project a removed root manifest as catalog authority', () => {
    const input = {
      name: 'comic-paneling',
      description: 'Analyze comic panels.',
      source: 'project' as const,
      manifest: { catalog: { role: 'focused-skill', visibility: 'hidden' } },
    };

    expect(toLazySkillCatalogEntry(input).catalog).toEqual({
      role: 'standalone',
      source: 'project',
      visibility: 'primary',
      editable: true,
      actions: [{ id: 'run' }, { id: 'edit' }, { id: 'reveal' }, { id: 'duplicate' }],
    });
  });

  it('defaults editable personal Skills to edit, reveal and duplicate actions', () => {
    const entry = toConfiguredSkillCatalogEntry({
      ...baseSkill({ source: 'personal' }),
      notes: 'User notes',
      tags: ['review', 'writing'],
    } as Skill & { notes: string; tags: string[] });

    expect(entry.catalog.actions.map((action) => action.id)).toEqual([
      'run',
      'edit',
      'reveal',
      'duplicate',
    ]);
    expect(entry.tags).toEqual(['review', 'writing']);
  });
});
