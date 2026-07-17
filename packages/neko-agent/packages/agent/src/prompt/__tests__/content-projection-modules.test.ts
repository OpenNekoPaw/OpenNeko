/**
 * Tests for the content-projection modules used by prompt composition:
 * MemoryProjectModule, MemoryRecallModule, CreativeVersionLogModule,
 * and AgentsMdModule.
 *
 * All modules here share the same shape — an externally-injected content string that
 * projects into a single prompt section — so their tests are parameterised.
 * Additional module-specific assertions (layer, priority, sectionId, heading
 * prefix) are covered per-instance at the bottom.
 */
import { describe, it, expect } from 'vitest';
import { MemoryProjectModule } from '../modules/memory/memory-project-module';
import { MemoryRecallModule } from '../modules/memory/memory-recall-module';
import { CreativeVersionLogModule } from '../modules/ephemeral/creative-version-log-module';
import { ValidationGuidanceModule } from '../modules/ephemeral/validation-guidance-module';
import { AgentsMdModule } from '../modules/environment/agents-md-module';
import { SubpackageFragmentsModule } from '../modules/environment/subpackage-fragments-module';
import type { PromptContext } from '../context';

type ProjectionSetter = (content: string | null) => void;

interface ModuleSpec {
  name: string;
  make: () => {
    mod: {
      manifest: { id: string; layers: readonly string[]; priority: number };
      render: (
        ctx?: PromptContext,
      ) => Promise<readonly { sectionId: string; content: string }[] | null>;
    };
    setContent: ProjectionSetter;
  };
  expectedManifestId: string;
  expectedLayer: string;
  expectedPriority: number;
  expectedSectionId: string;
  headingPrefix: string | null; // null = verbatim (no heading wrapping)
}

const ZH_PROMPT_CONTEXT: PromptContext = {
  runId: null,
  stage: null,
  locale: 'zh',
  projectPath: '',
  activeSkillName: null,
  activeTools: [],
};

const SPECS: ModuleSpec[] = [
  {
    name: 'MemoryProjectModule',
    make: () => {
      const mod = new MemoryProjectModule();
      return { mod, setContent: (c) => mod.setContent(c) };
    },
    expectedManifestId: 'memory.project',
    expectedLayer: 'environment',
    expectedPriority: 60,
    expectedSectionId: 'memory:project',
    headingPrefix: '## Project Memory\n\n',
  },
  {
    name: 'MemoryRecallModule',
    make: () => {
      const mod = new MemoryRecallModule();
      return { mod, setContent: (c) => mod.setContent(c) };
    },
    expectedManifestId: 'memory.recall',
    expectedLayer: 'ephemeral',
    expectedPriority: 40,
    expectedSectionId: 'memory:recall',
    headingPrefix: '## Recalled Memories\n\n',
  },
  {
    name: 'CreativeVersionLogModule',
    make: () => {
      const mod = new CreativeVersionLogModule();
      return { mod, setContent: (c) => mod.setSummary(c) };
    },
    expectedManifestId: 'creative.version-log',
    expectedLayer: 'ephemeral',
    expectedPriority: 30,
    expectedSectionId: 'creative-version-log',
    headingPrefix: null,
  },
  {
    name: 'AgentsMdModule',
    make: () => {
      const mod = new AgentsMdModule();
      return { mod, setContent: (c) => mod.setContent(c) };
    },
    expectedManifestId: 'agents-md',
    expectedLayer: 'environment',
    expectedPriority: 80,
    expectedSectionId: 'agents-md:override',
    headingPrefix: null,
  },
];

for (const spec of SPECS) {
  describe(spec.name, () => {
    it('returns null when no content has been set', async () => {
      const { mod } = spec.make();
      expect(await mod.render()).toBeNull();
    });

    it('treats whitespace-only content as empty (null)', async () => {
      const { mod, setContent } = spec.make();
      setContent('   \n  \t  ');
      expect(await mod.render()).toBeNull();
    });

    it('projects non-empty content into a single section', async () => {
      const { mod, setContent } = spec.make();
      setContent('CONTENT_BODY');
      const result = await mod.render();
      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      const section = result![0]!;
      expect(section.sectionId).toBe(spec.expectedSectionId);
      const expectedContent = spec.headingPrefix
        ? spec.headingPrefix + 'CONTENT_BODY'
        : 'CONTENT_BODY';
      expect(section.content).toBe(expectedContent);
    });

    it('projects Chinese headings when the prompt context locale is zh', async () => {
      const { mod, setContent } = spec.make();
      setContent('## User Preferences\n- Tool result: docs updated');

      const result = await mod.render(ZH_PROMPT_CONTEXT);
      expect(result).not.toBeNull();
      const content = result![0]!.content;

      if (spec.name === 'MemoryProjectModule') {
        expect(content).toContain('## 项目记忆');
        expect(content).toContain('## 用户偏好');
        expect(content).toContain('- 工具结果: docs updated');
        expect(content).not.toContain('## Project Memory');
        expect(content).not.toContain('## User Preferences');
        expect(content).not.toContain('Tool result:');
      }
    });

    it('setContent(null) clears prior content', async () => {
      const { mod, setContent } = spec.make();
      setContent('BODY');
      expect(await mod.render()).not.toBeNull();
      setContent(null);
      expect(await mod.render()).toBeNull();
    });

    it('manifest declares expected id, layer, and priority', () => {
      const { mod } = spec.make();
      expect(mod.manifest.id).toBe(spec.expectedManifestId);
      expect(mod.manifest.layers).toEqual([spec.expectedLayer]);
      expect(mod.manifest.priority).toBe(spec.expectedPriority);
    });
  });
}

describe('MemoryRecallModule locale projection', () => {
  it('projects Chinese headings and known memory labels for zh locale', async () => {
    const mod = new MemoryRecallModule();
    mod.setContent(
      [
        '## Recent Actions',
        '- Tool result: image generated',
        '- [project] ## Recent Decisions (relevance: 0.42)',
      ].join('\n'),
    );

    const result = await mod.render(ZH_PROMPT_CONTEXT);

    expect(result?.[0]?.content).toContain('## 回忆记忆');
    expect(result?.[0]?.content).toContain('## 最近操作');
    expect(result?.[0]?.content).toContain('- 工具结果: image generated');
    expect(result?.[0]?.content).toContain('- [project] ## 近期决策 (相关度: 0.42)');
    expect(result?.[0]?.content).not.toContain('## Recalled Memories');
    expect(result?.[0]?.content).not.toContain('## Recent Actions');
    expect(result?.[0]?.content).not.toContain('## Recent Decisions');
    expect(result?.[0]?.content).not.toContain('relevance:');
    expect(result?.[0]?.content).not.toContain('Tool result:');
  });

  it('preserves persisted tool-result payloads instead of translating prose by string detection', async () => {
    const mod = new MemoryProjectModule();
    mod.setContent(
      [
        '## Recent Actions',
        '- Tool result: {"activated":true,"skillName":"image","message":"Activated skill \\"image\\""}',
        '- Tool result: {"text":"EPUB image document with 10 image pages"}',
        '- Tool result: {"text":"EPUB chapter range with 3 image pages"}',
        '- Tool result: {"text":"CBZ page range 1-4: 4 image pages"}',
      ].join('\n'),
    );

    const result = await mod.render(ZH_PROMPT_CONTEXT);
    const content = result?.[0]?.content ?? '';

    expect(content).toContain('## 最近操作');
    expect(content).toContain(String.raw`Activated skill \"image\"`);
    expect(content).toContain('EPUB image document with 10 image pages');
    expect(content).toContain('EPUB chapter range with 3 image pages');
    expect(content).toContain('CBZ page range 1-4: 4 image pages');
    expect(content).not.toContain('已激活技能');
  });
});

describe('ValidationGuidanceModule locale projection', () => {
  it('projects the guidance heading in Chinese for zh locale', async () => {
    const mod = new ValidationGuidanceModule();
    mod.setContent('permission denied');

    const result = await mod.render(ZH_PROMPT_CONTEXT);

    expect(result?.[0]?.content).toContain('## 验证指导');
    expect(result?.[0]?.content).not.toContain('## Validation Guidance');
  });
});

describe('SubpackageFragmentsModule locale projection', () => {
  it('selects localized fragment content during render for zh locale', async () => {
    const mod = new SubpackageFragmentsModule();
    mod.setFragments([
      {
        id: 'neko-canvas:test-fragment',
        content: '## Canvas Rendering Guide\nUse English fallback.',
        locales: {
          zh: { content: '## 画布渲染指南\n使用中文提示词。' },
        },
      },
    ]);

    const result = await mod.render(ZH_PROMPT_CONTEXT);

    expect(result?.[0]?.content).toContain('## 画布渲染指南');
    expect(result?.[0]?.content).not.toContain('## Canvas Rendering Guide');
    expect(result?.[0]?.content).not.toContain('Use English fallback.');
  });
});

// Module-specific regression: the content-getter shape differs per module
// (getContent vs getSummary), which some callers depend on.
describe('MemoryProjectModule getContent', () => {
  it('reflects setContent state', () => {
    const mod = new MemoryProjectModule();
    expect(mod.getContent()).toBeNull();
    mod.setContent('X');
    expect(mod.getContent()).toBe('X');
    mod.setContent(null);
    expect(mod.getContent()).toBeNull();
  });
});

describe('CreativeVersionLogModule getSummary', () => {
  it('reflects setSummary state', () => {
    const mod = new CreativeVersionLogModule();
    expect(mod.getSummary()).toBeNull();
    mod.setSummary('v1');
    expect(mod.getSummary()).toBe('v1');
  });
});
