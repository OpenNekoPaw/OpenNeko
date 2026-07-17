/**
 * Legacy Skill metadata compatibility validation.
 *
 * These tests preserve deterministic diagnostics for old flattened runtime snapshots
 * and explicit migration inputs. Canonical Skill authoring uses portable `SKILL.md`
 * plus optional `agents/neko.yaml`; normal loading never reads a root manifest.
 */

import { describe, it, expect } from 'vitest';
import {
  collectSkillProfileReferences,
  toConfiguredSkillCatalogEntry,
  toLazySkillCatalogEntry,
  toSkillCatalogEntry,
  validateSkill,
  validateSkillManifest,
} from '../skill';
import type { Skill, SkillManifest } from '../skill';

function baseSkill(overrides: Partial<Skill> = {}): Partial<Skill> {
  return {
    name: 'my-skill',
    description: 'Use when the user wants to exercise the validator surface.',
    content: '# my-skill\n\nSome persona content.',
    source: 'builtin',
    enabled: true,
    version: '1.0.0',
    domain: 'cut',
    ...overrides,
  };
}

function baseManifest(overrides: Partial<SkillManifest> = {}): Partial<SkillManifest> {
  return {
    version: '1.0.0',
    domain: 'cut',
    ...overrides,
  };
}

describe('validateSkill — runtime projection compatibility', () => {
  describe('base invariants', () => {
    it('requires slash-routable lowercase hyphen skill names', () => {
      for (const name of ['Bad Name', '中文-skill', 'skill_name']) {
        const r = validateSkill(baseSkill({ name }));
        expect(r.valid).toBe(false);
        expect(r.errors.some((e) => e.includes('name'))).toBe(true);
      }
    });

    it('limits skill names to 64 characters', () => {
      const r = validateSkill(baseSkill({ name: 'a'.repeat(65) }));

      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('64'))).toBe(true);
    });

    it('requires description and content', () => {
      const r = validateSkill(baseSkill({ description: '', content: '' }));

      expect(r.valid).toBe(false);
      expect(r.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('description'),
          expect.stringContaining('content'),
        ]),
      );
    });

    it('limits descriptions to 2048 characters', () => {
      const r = validateSkill(baseSkill({ description: 'a'.repeat(2049) }));

      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('2048'))).toBe(true);
    });
  });

  describe('version', () => {
    it('accepts a valid semver string', () => {
      const r = validateSkill(baseSkill({ version: '2.3.4' }));
      expect(r.valid).toBe(true);
    });

    it('does not require a legacy version on canonical runtime projections', () => {
      const r = validateSkill(baseSkill({ version: undefined }));
      expect(r.valid).toBe(true);
      expect(r.warnings.some((w) => w.includes('version'))).toBe(false);
    });

    it('errors on a malformed version', () => {
      const r = validateSkill(baseSkill({ version: '1.0' }));
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('version'))).toBe(true);
    });
  });

  describe('domain', () => {
    it('does not require a legacy domain on canonical runtime projections', () => {
      const r = validateSkill(baseSkill({ domain: undefined }));
      expect(r.valid).toBe(true);
      expect(r.warnings.some((w) => w.includes('domain'))).toBe(false);
    });

    it('errors on an empty domain', () => {
      const r = validateSkill(baseSkill({ domain: '   ' }));
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('domain'))).toBe(true);
    });
  });

  describe('requiredSubpackages', () => {
    it('accepts a well-formed list', () => {
      const r = validateSkill(
        baseSkill({
          requiredSubpackages: [
            { id: 'neko-cut', required: true, minVersion: '1.0.0' },
            {
              id: 'neko-audio',
              required: false,
              fallback: { message: 'no BGM without neko-audio' },
            },
          ],
        }),
      );
      expect(r.valid).toBe(true);
    });

    it('errors on duplicate ids', () => {
      const r = validateSkill(
        baseSkill({
          requiredSubpackages: [
            { id: 'neko-cut', required: true },
            { id: 'neko-cut', required: false },
          ],
        }),
      );
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('Duplicate'))).toBe(true);
    });

    it('errors when required is not a boolean', () => {
      const r = validateSkill(
        baseSkill({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          requiredSubpackages: [{ id: 'neko-cut', required: 'yes' as any }],
        }),
      );
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('required'))).toBe(true);
    });

    it('errors on malformed minVersion', () => {
      const r = validateSkill(
        baseSkill({
          requiredSubpackages: [{ id: 'neko-cut', required: true, minVersion: 'latest' }],
        }),
      );
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('minVersion'))).toBe(true);
    });
  });

  describe('autoInvoke', () => {
    it('accepts boolean true/false', () => {
      expect(validateSkill(baseSkill({ autoInvoke: true })).valid).toBe(true);
      expect(validateSkill(baseSkill({ autoInvoke: false })).valid).toBe(true);
    });

    it('errors on non-boolean', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = validateSkill(baseSkill({ autoInvoke: 'yes' as any }));
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('autoInvoke'))).toBe(true);
    });
  });

  describe('retired workflow DSL fields', () => {
    it('ignores unknown retired workflow DSL fields', () => {
      const r = validateSkillManifest({
        ...baseManifest(),
        phases: [],
        pipelines: {},
        workflow: {},
        stages: [],
      } as unknown as SkillManifest);

      expect(r.valid).toBe(true);
      expect(r.errors).toEqual([]);
    });
  });

  describe('referencedAssets', () => {
    it('accepts well-formed asset references', () => {
      const r = validateSkill(
        baseSkill({
          referencedAssets: [
            { uri: 'asset://styles/cinematic-lut', required: false, purpose: 'default LUT' },
          ],
        }),
      );
      expect(r.valid).toBe(true);
    });

    it('errors when uri does not start with asset://', () => {
      const r = validateSkill(
        baseSkill({
          referencedAssets: [{ uri: 'https://example.com/foo.png' }],
        }),
      );
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('asset://'))).toBe(true);
    });
  });

  describe('referencedSkills', () => {
    it('accepts collaborator and delegator relationships', () => {
      const r = validateSkill(
        baseSkill({
          referencedSkills: [
            { id: 'audio-expert', relationship: 'collaborator' },
            { id: 'render-delegate', relationship: 'delegator' },
          ],
        }),
      );
      expect(r.valid).toBe(true);
    });

    it('errors on unknown relationship values', () => {
      const r = validateSkill(
        baseSkill({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          referencedSkills: [{ id: 'foo', relationship: 'partner' as any }],
        }),
      );
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('relationship'))).toBe(true);
    });
  });

  describe('compliance', () => {
    it('accepts a well-formed block', () => {
      const r = validateSkill(
        baseSkill({
          compliance: {
            framework: 'SOC2',
            auditRequired: true,
            reviewedBy: ['legal', 'security'],
            reviewDate: '2026-04-01',
          },
        }),
      );
      expect(r.valid).toBe(true);
    });

    it('errors when auditRequired is not a boolean', () => {
      const r = validateSkill(
        baseSkill({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          compliance: { auditRequired: 'yes' as any },
        }),
      );
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('auditRequired'))).toBe(true);
    });

    it('errors when reviewedBy is not an array', () => {
      const r = validateSkill(
        baseSkill({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          compliance: { reviewedBy: 'legal' as any },
        }),
      );
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('reviewedBy'))).toBe(true);
    });
  });

  describe('backwards compatibility', () => {
    it('portable runtime projections are valid without legacy metadata warnings', () => {
      const r = validateSkill({
        name: 'legacy',
        description: 'A legacy skill that predates the SDD block.',
        content: '# legacy',
        source: 'builtin',
        enabled: true,
      });
      expect(r.valid).toBe(true);
      expect(r.warnings).toEqual([]);
      expect(r.errors.length).toBe(0);
    });
  });
});

describe('validateSkillManifest — explicit legacy compatibility pass', () => {
  it('accepts well-formed legacy metadata', () => {
    const r = validateSkillManifest(baseManifest());
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('empty legacy metadata warns on missing version + domain but does not error', () => {
    const r = validateSkillManifest({});
    expect(r.valid).toBe(true);
    expect(r.warnings.length).toBeGreaterThanOrEqual(2);
    expect(r.errors).toEqual([]);
  });

  it('malformed version errors', () => {
    const r = validateSkillManifest(baseManifest({ version: '1.x' }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('version'))).toBe(true);
  });

  it('requiredSubpackages duplicate ids reported', () => {
    const r = validateSkillManifest(
      baseManifest({
        requiredSubpackages: [
          { id: 'neko-cut', required: true },
          { id: 'neko-cut', required: false },
        ],
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Duplicate'))).toBe(true);
  });

  it('referencedAssets must use asset:// URIs', () => {
    const r = validateSkillManifest(
      baseManifest({
        referencedAssets: [{ uri: 'file:///local/path' }],
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('asset://'))).toBe(true);
  });

  it('accepts a prompt-chain era legacy metadata block', () => {
    const r = validateSkillManifest({
      version: '1.2.0',
      domain: 'cut',
      requiredSubpackages: [
        { id: 'neko-cut', required: true, minVersion: '1.0.0' },
        { id: 'neko-audio', required: false, fallback: { message: 'no BGM' } },
      ],
      autoInvoke: true,
      referencedAssets: [
        { uri: 'asset://styles/cinematic-lut', required: false, purpose: 'default LUT' },
      ],
      referencedSkills: [{ id: 'audio-expert', relationship: 'collaborator' }],
      profileReferences: [
        {
          profileId: 'provider-expression:studio',
          kind: 'provider-expression',
          relationship: 'prefers',
          versionRange: '^1.0.0',
        },
        {
          profileId: 'media-production.shot-image-prep',
          kind: 'artifact',
          relationship: 'produces',
        },
      ],
      mediaWorkflow: {
        acceptedModalities: ['comic', 'image-sequence'],
        producedArtifacts: ['CompositeArtifact', 'GenericTable', 'StoryboardTable'],
        artifactProfiles: ['media-production.shot-image-prep'],
        referencedCapabilities: ['canvas.ingestMarkdown'],
        suggestedProjectors: ['capability:canvas.ingestMarkdown'],
        tags: ['comic', 'storyboard'],
        costLevel: 'low',
        riskLevel: 'low',
        validationRequirements: ['StoryboardTable'],
        optionalTools: ['ReadImage'],
      },
      compliance: {
        framework: 'creator-standard',
        auditRequired: false,
      },
      catalog: {
        role: 'orchestrator',
        visibility: 'primary',
        actions: ['run', { id: 'fork', targetSource: 'project' }],
      },
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('accepts media workflow hints without requiring them on portable runtime projections', () => {
    const skill = baseSkill({
      mediaWorkflow: {
        acceptedModalities: ['image'],
        producedArtifacts: ['StoryboardTable', 'storyboard-plan-overlay'],
        artifactProfiles: ['media-production.shot-image-prep'],
        inputArtifacts: ['generated-media-ref'],
        referencedCapabilities: ['cut.importStoryboard'],
        suggestedProjectors: ['projector:storyboard-to-cut'],
        tags: ['media-production'],
        costLevel: 'medium',
        riskLevel: 'medium',
        validationRequirements: ['StoryboardTable'],
      },
    });

    const withHints = validateSkill(skill);
    const withoutHints = validateSkill(baseSkill({ mediaWorkflow: undefined }));

    expect(withHints.valid).toBe(true);
    expect(withHints.errors).toEqual([]);
    expect(withoutHints.valid).toBe(true);
    expect(withoutHints.errors).toEqual([]);
  });

  it('rejects workflow-order DSL fields in media workflow hints', () => {
    const r = validateSkillManifest(
      baseManifest({
        mediaWorkflow: {
          acceptedModalities: ['comic'],
          producedArtifacts: ['StoryboardTable'],
          steps: ['inspect', 'structure'],
          routes: [{ from: 'comic', to: 'video' }],
        } as unknown as SkillManifest['mediaWorkflow'],
      }),
    );

    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('mediaWorkflow.steps is not allowed'),
        expect.stringContaining('mediaWorkflow.routes is not allowed'),
      ]),
    );
  });

  it('warns when skill prompt text claims executable workflow semantics', () => {
    const r = validateSkill(
      baseSkill({
        content: [
          '# media-orchestrator',
          '',
          'This skill defines a workflow DAG with executable nodes and runtime transitions.',
        ].join('\n'),
      }),
    );

    expect(r.valid).toBe(true);
    expect(r.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Skill prompt text appears to describe executable workflow'),
      ]),
    );
  });

  it('does not warn when workflow language is clearly prompt-chain guidance', () => {
    const r = validateSkill(
      baseSkill({
        content: [
          '# media-method',
          '',
          'This is prompt-chain guidance, not an executable workflow runtime or DAG.',
          'The Agent decides whether to skip, reorder, or revise each suggestion.',
        ].join('\n'),
      }),
    );

    expect(r.valid).toBe(true);
    expect(r.warnings).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('Skill prompt text appears to describe executable workflow'),
      ]),
    );
  });

  it('rejects malformed media workflow hint fields', () => {
    const r = validateSkillManifest(
      baseManifest({
        mediaWorkflow: {
          acceptedModalities: ['comic', ''],
          artifactProfiles: ['comic-shot-plan', ''],
          referencedCapabilities: ['canvas.ingestMarkdown', ''],
          suggestedProjectors: ['capability:canvas.ingestMarkdown', ''],
          costLevel: 'expensive',
          riskLevel: 'unsafe',
        } as unknown as SkillManifest['mediaWorkflow'],
      }),
    );

    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(
      expect.arrayContaining([
        'mediaWorkflow.acceptedModalities[1] must be a non-empty string',
        'mediaWorkflow.artifactProfiles[1] must be a non-empty string',
        'mediaWorkflow.referencedCapabilities[1] must be a non-empty string',
        'mediaWorkflow.suggestedProjectors[1] must be a non-empty string',
        'mediaWorkflow.costLevel must be "free", "low", "medium", or "high"',
        'mediaWorkflow.riskLevel must be "low", "medium", "high", or "destructive"',
      ]),
    );
  });

  it('rejects malformed profile references', () => {
    const r = validateSkillManifest(
      baseManifest({
        profileReferences: [
          {
            profileId: '',
            kind: 'workflow',
            relationship: 'owns',
            versionRange: '',
          },
        ] as unknown as SkillManifest['profileReferences'],
      }),
    );

    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(
      expect.arrayContaining([
        'profileReferences[0].profileId must be a non-empty string',
        'profileReferences[0].kind must be a supported Agent profile kind',
        'profileReferences[0].relationship must be "consumes", "produces", "requires", or "prefers"',
        'profileReferences[0].versionRange must be a non-empty string',
      ]),
    );
  });

  it('normalizes mediaWorkflow artifactProfiles as produced Artifact Profile references', () => {
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
  });
});

describe('skill catalog projection metadata', () => {
  it('projects old provider-like skills with runtime-safe plugin defaults', () => {
    const entry = toSkillCatalogEntry(
      {
        name: 'legacy-plugin-skill',
        description: 'Legacy plugin skill',
      },
      {
        command: 'plugin.runSkill',
        tags: ['plugin'],
      },
    );

    expect(entry.catalog).toMatchObject({
      role: 'standalone',
      source: 'plugin',
      visibility: 'primary',
      editable: false,
      actions: [{ id: 'run' }],
    });
    expect(entry.command).toBe('plugin.runSkill');
    expect(entry.tags).toEqual(['plugin']);
  });

  it('ignores legacy root manifest catalog metadata during normal projection', () => {
    const legacyLikeSkill = {
      name: 'comic-paneling',
      description: 'Analyze comic panels.',
      icon: 'book-open',
      source: 'project' as const,
      manifest: {
        catalog: {
          role: 'focused-skill',
          groupId: 'poisoned-group',
          visibility: 'hidden',
          editable: false,
          actions: ['run'],
        },
      },
    };

    const entry = toLazySkillCatalogEntry(legacyLikeSkill);

    expect(entry.catalog).toEqual({
      role: 'standalone',
      source: 'project',
      visibility: 'primary',
      editable: true,
      actions: [{ id: 'run' }, { id: 'edit' }, { id: 'reveal' }, { id: 'duplicate' }],
    });
  });

  it('defaults editable file skills to edit/reveal/duplicate actions', () => {
    const entry = toConfiguredSkillCatalogEntry({
      ...baseSkill({ source: 'personal' }),
      notes: 'User notes',
      tags: ['review', 'writing'],
    } as Skill & { notes: string; tags: string[] });

    expect(entry.catalog.source).toBe('personal');
    expect(entry.catalog.editable).toBe(true);
    expect(entry.catalog.actions.map((action) => action.id)).toEqual([
      'run',
      'edit',
      'reveal',
      'duplicate',
    ]);
    expect(entry.tags).toEqual(['review', 'writing']);
  });

  it('rejects workflow-order DSL fields in catalog metadata', () => {
    const r = validateSkillManifest(
      baseManifest({
        catalog: {
          role: 'orchestrator',
          steps: ['inspect', 'compose'],
          routes: [{ from: 'comic', to: 'storyboard' }],
        } as unknown as SkillManifest['catalog'],
      }),
    );

    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('catalog.steps is not allowed'),
        expect.stringContaining('catalog.routes is not allowed'),
      ]),
    );
  });

  it('rejects malformed catalog roles, visibility and actions', () => {
    const r = validateSkillManifest(
      baseManifest({
        catalog: {
          role: 'pipeline',
          visibility: 'everyone',
          parentSkillIds: ['media-production', ''],
          actions: ['run', { id: 'edit', targetSource: 'builtin' }],
        } as unknown as SkillManifest['catalog'],
      }),
    );

    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('catalog.role must be one of'),
        expect.stringContaining('catalog.visibility must be one of'),
        'catalog.parentSkillIds[1] must be a non-empty string',
        'catalog.actions[1].targetSource must be "project" or "personal"',
      ]),
    );
  });
});
