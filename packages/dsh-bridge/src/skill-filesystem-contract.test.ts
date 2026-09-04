import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';
import { renderSkillContent, SkillRegistry, type SkillCandidate } from '@deepseek-ai/dsh-skill';
import { afterEach, describe, expect, it } from 'vitest';

import { validateStagedSkillPackage } from './index';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('locked DSH filesystem Skill provider contract', () => {
  it('validates isolated authoring candidates through the locked provider for both layouts', async () => {
    const directoryRoot = await fixtureRoot();
    await writeDirectorySkill(directoryRoot, 'candidate', 'Directory authoring candidate.');
    await writeFile(
      join(directoryRoot, 'candidate', 'SKILL.md'),
      '---\nname: created-directory\ndescription: Directory authoring candidate.\n---\n# Created\n',
      'utf8',
    );
    const flatRoot = await fixtureRoot();
    await writeFile(
      join(flatRoot, 'candidate.md'),
      '---\nname: created-flat\ndescription: Flat authoring candidate.\n---\n# Created\n',
      'utf8',
    );

    await expect(
      validateStagedSkillPackage(directoryRoot, 'directory', 'candidate/SKILL.md'),
    ).resolves.toEqual({
      name: 'created-directory',
    });
    await expect(validateStagedSkillPackage(flatRoot, 'flat', 'candidate.md')).resolves.toEqual({
      name: 'created-flat',
    });
  });

  it('rejects a staged root with a second candidate instead of selecting one', async () => {
    const root = await fixtureRoot();
    await writeDirectorySkill(root, 'candidate', 'Canonical candidate.');
    await writeFlatSkill(root, 'sibling', 'Unexpected sibling.');

    await expect(
      validateStagedSkillPackage(root, 'directory', 'candidate/SKILL.md'),
    ).rejects.toThrow(/exactly one DSH Skill/u);
  });

  it('rejects an entry that escapes the isolated validation root', async () => {
    const parent = await fixtureRoot();
    const root = join(parent, 'validation');
    await mkdir(root);
    await writeFile(
      join(parent, 'outside.md'),
      '---\nname: outside\ndescription: Outside.\n---\n# Outside\n',
      'utf8',
    );

    await expect(validateStagedSkillPackage(root, 'flat', '../outside.md')).rejects.toThrow(
      /invalid for its layout/u,
    );
  });

  it('discovers directory and flat layouts while preserving all invocation-policy combinations', async () => {
    const root = await fixtureRoot();
    await writeDirectorySkill(root, 'directory-default', 'Directory default.');
    await writeFlatSkill(
      root,
      'flat-user-only',
      'Flat user only.',
      'disable-model-invocation: true\n',
    );
    await writeDirectorySkill(
      root,
      'directory-model-only',
      'Directory model only.',
      'user-invocable: false\n',
    );
    await writeFlatSkill(
      root,
      'flat-disabled',
      'Flat disabled.',
      'disable-model-invocation: true\nuser-invocable: false\n',
    );
    const provider = isolatedProvider(root);

    const observation = await provider.list({ cwd: root });

    expect(Array.isArray(observation)).toBe(true);
    const candidates = Array.isArray(observation) ? observation : observation.candidates;
    expect(
      candidates.map((candidate) => ({
        name: candidate.name,
        invocation: candidate.invocation,
        source: candidate.source,
      })),
    ).toEqual([
      {
        name: 'directory-default',
        invocation: { modelInvocable: true, userInvocable: true },
        source: 'custom',
      },
      {
        name: 'directory-model-only',
        invocation: { modelInvocable: true, userInvocable: false },
        source: 'custom',
      },
      {
        name: 'flat-disabled',
        invocation: { modelInvocable: false, userInvocable: false },
        source: 'custom',
      },
      {
        name: 'flat-user-only',
        invocation: { modelInvocable: false, userInvocable: true },
        source: 'custom',
      },
    ]);
    await provider.dispose();
  });

  it('loads only the selected body and resource-base guidance without preloading sibling resources', async () => {
    const root = await fixtureRoot();
    await writeDirectorySkill(root, 'guided-skill', 'Guided skill.');
    await mkdir(join(root, 'guided-skill', 'references'));
    await writeFile(
      join(root, 'guided-skill', 'references', 'guide.md'),
      'RESOURCE_SENTINEL',
      'utf8',
    );
    await writeDirectorySkill(root, 'sibling-skill', 'Sibling skill.');
    const provider = isolatedProvider(root);
    const observation = await provider.list({ cwd: root });
    const candidates = Array.isArray(observation) ? observation : observation.candidates;
    const candidate = candidates.find((item) => item.name === 'guided-skill');
    expect(candidate).toBeDefined();

    const definition = await provider.get(candidate!, { cwd: root });

    expect(definition).toMatchObject({
      name: 'guided-skill',
      content: '# guided-skill',
      resourceBase: { kind: 'directory', path: join(root, 'guided-skill') },
    });
    expect(definition?.content).not.toContain('RESOURCE_SENTINEL');
    expect(candidates.map((item) => item.name)).toContain('sibling-skill');
    await provider.dispose();
  });

  it('loads builtin content guidance through DSH without preloading any referenced guide', async () => {
    const skillRoot = resolve(import.meta.dirname, '../../skills/skills');
    const contentRoot = join(skillRoot, 'content-authoring');
    const guidePaths = [
      'references/creative-proposal.md',
      'references/analysis-report.md',
      'references/project-proposal.md',
      'references/execution-plan.md',
      'references/prompt-package.md',
      'references/model-tool-handoff.md',
    ];
    const provider = isolatedProvider(skillRoot);
    const observation = await provider.list({ cwd: skillRoot });
    const candidates = Array.isArray(observation) ? observation : observation.candidates;
    const candidate = candidates.find((item) => item.name === 'content-authoring');
    if (candidate === undefined) throw new Error('Builtin content-authoring Skill was not found.');

    const definition = await provider.get(candidate, { cwd: skillRoot });
    if (definition === undefined) throw new Error('Builtin content-authoring Skill did not load.');

    expect(definition).toMatchObject({
      name: 'content-authoring',
      resourceBase: { kind: 'directory', path: contentRoot },
    });
    for (const guidePath of guidePaths) {
      expect(definition.content).toContain(`](${guidePath})`);
      const guide = await readFile(join(contentRoot, ...guidePath.split('/')), 'utf8');
      expect(definition.content).not.toContain(guide);
    }
    const rendered = renderSkillContent(definition);
    expect(rendered).toContain(`Base directory for this skill: ${contentRoot}`);
    expect(rendered).toContain('Load referenced resources only as needed.');
    await provider.dispose();
  });

  it('keeps every builtin Skill and model-readable resource Chinese-first and English-equivalent', async () => {
    const skillRoot = resolve(import.meta.dirname, '../../skills/skills');
    const skillEntries = (await readdir(skillRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name));
    const provider = isolatedProvider(skillRoot);
    const observation = await provider.list({ cwd: skillRoot });
    const candidates = Array.isArray(observation) ? observation : observation.candidates;

    expect(candidates.map((candidate) => candidate.name).sort()).toEqual(
      skillEntries.map((entry) => entry.name),
    );
    for (const entry of skillEntries) {
      const candidate = candidates.find((item) => item.name === entry.name);
      if (candidate === undefined) throw new Error(`Builtin Skill '${entry.name}' was not found.`);
      expect(candidate.description, `${entry.name} description`).toMatch(/^\p{Script=Han}/u);
      expect(candidate.description, `${entry.name} description`).toMatch(/[A-Za-z]/u);
      expect(
        candidate.description.length,
        `${entry.name} catalog description length`,
      ).toBeLessThanOrEqual(500);

      const definition = await provider.get(candidate, { cwd: skillRoot });
      if (definition === undefined) throw new Error(`Builtin Skill '${entry.name}' did not load.`);
      expectBilingualGuidance(definition.content, `${entry.name}/SKILL.md`, '中文方法');

      const referencesRoot = join(skillRoot, entry.name, 'references');
      const referenceEntries = await readdir(referencesRoot, { withFileTypes: true }).catch(
        (error: unknown) => {
          if (isMissingPathError(error)) return [];
          throw error;
        },
      );
      for (const reference of referenceEntries) {
        if (!reference.isFile() || !reference.name.endsWith('.md')) continue;
        const path = join(referencesRoot, reference.name);
        expectBilingualGuidance(
          await readFile(path, 'utf8'),
          `${entry.name}/references/${reference.name}`,
          '中文指南',
        );
      }

      const agentsRoot = join(skillRoot, entry.name, 'agents');
      const agentEntries = await readdir(agentsRoot, { withFileTypes: true }).catch(
        (error: unknown) => {
          if (isMissingPathError(error)) return [];
          throw error;
        },
      );
      for (const agent of agentEntries) {
        if (!agent.isFile() || !agent.name.endsWith('.yaml')) continue;
        expectBilingualAgentOverlay(
          await readFile(join(agentsRoot, agent.name), 'utf8'),
          `${entry.name}/agents/${agent.name}`,
        );
      }
    }
    await provider.dispose();
  });

  it('keeps detailed media-production guidance as on-demand resources', async () => {
    const skillRoot = resolve(import.meta.dirname, '../../skills/skills');
    const mediaRoot = join(skillRoot, 'media-production');
    const guidePaths = [
      'references/adaptation-feasibility.md',
      'references/time-based-production-specification.md',
    ];
    const provider = isolatedProvider(skillRoot);
    const observation = await provider.list({ cwd: skillRoot });
    const candidates = Array.isArray(observation) ? observation : observation.candidates;
    const candidate = candidates.find((item) => item.name === 'media-production');
    if (candidate === undefined) throw new Error('Builtin media-production Skill was not found.');

    const definition = await provider.get(candidate, { cwd: skillRoot });
    if (definition === undefined) throw new Error('Builtin media-production Skill did not load.');

    expect(definition).toMatchObject({
      name: 'media-production',
      resourceBase: { kind: 'directory', path: mediaRoot },
    });
    for (const guidePath of guidePaths) {
      const guide = await readFile(join(mediaRoot, ...guidePath.split('/')), 'utf8');
      expect(definition.content).toContain(`](${guidePath})`);
      expect(definition.content).not.toContain(guide);
    }
    expect(renderSkillContent(definition)).toContain('Load referenced resources only as needed.');
    await provider.dispose();
  });

  it('keeps adjacent creative Skills at distinct capability boundaries', async () => {
    const skillRoot = resolve(import.meta.dirname, '../../skills/skills');
    const provider = isolatedProvider(skillRoot);
    const observation = await provider.list({ cwd: skillRoot });
    const candidates = Array.isArray(observation) ? observation : observation.candidates;
    const descriptions = Object.fromEntries(
      candidates.map((candidate) => [candidate.name, candidate.description]),
    );

    expect(descriptions.image).toContain('不负责参考职责设计、候选选择、视频合成或时间线编排');
    expect(descriptions.video).toContain('不负责裁剪变速、技术修复、时间线剪辑或导出');
    expect(descriptions['media-preparation']).toContain('可直接提交');
    expect(descriptions['media-preparation']).toContain('不执行生成、候选筛选或后期');
    expect(descriptions['content-authoring']).toContain('不因结果使用 Markdown 就自动参与');
    expect(descriptions['scene-to-music']).toContain('不负责对白音效、时间线放置或最终混音');
    expect(descriptions['script-to-timeline']).toContain('不负责媒体生成、轨道创建或时间线持久化');

    await provider.dispose();
  });

  it('keeps creative handoffs bounded by source evidence and admitted media inputs', async () => {
    const skillRoot = resolve(import.meta.dirname, '../../skills/skills');
    const provider = isolatedProvider(skillRoot);
    const observation = await provider.list({ cwd: skillRoot });
    const candidates = Array.isArray(observation) ? observation : observation.candidates;
    const definitions = new Map<string, string>();

    for (const skillName of [
      'media-production',
      'media-preparation',
      'media-selection',
      'storyboard',
      'video',
    ]) {
      const candidate = candidates.find((item) => item.name === skillName);
      if (candidate === undefined) throw new Error(`Builtin ${skillName} Skill was not found.`);
      const definition = await provider.get(candidate, { cwd: skillRoot });
      if (definition === undefined) throw new Error(`Builtin ${skillName} Skill did not load.`);
      definitions.set(skillName, definition.content);
    }

    expect(definitions.get('media-production')).toContain('先保持全局方向，再把当前步骤做深');
    expect(definitions.get('media-production')).toContain('素材分析与创意设计');
    expect(definitions.get('media-production')).toContain(
      '每阶段只记录目标产物、输入依赖和完成条件',
    );
    expect(definitions.get('media-production')).toContain('路线按依赖推进');
    expect(definitions.get('media-production')).toContain('当前创意阶段必须形成与声明制作范围相称');
    expect(definitions.get('media-production')).toContain('画面分析');
    expect(definitions.get('media-production')).toContain('人物分析');
    expect(definitions.get('media-production')).toContain('剧情分析');
    expect(definitions.get('media-production')).toContain('世界观分析');
    expect(definitions.get('media-production')).toContain('分镜转译分析');
    expect(definitions.get('media-production')).toContain('默认不展开预处理提示词');
    expect(definitions.get('media-production')).toContain('仅在用户明确要求');
    expect(definitions.get('media-production')).toContain('前、中、后各取一批低清联系表');
    expect(definitions.get('media-production')).toContain('每批最多四张不同页面');
    expect(definitions.get('media-production')).toContain('高清默认只读取一张最终入选页');
    expect(definitions.get('media-production')).toContain('读取与视觉检查是瞬态证据');
    expect(definitions.get('media-production')).toContain(
      '识别目录或章节边界、阅读顺序以及封面、目录、空白、广告、重复等非正文单元',
    );
    expect(definitions.get('media-production')).toContain(
      '缩小为来源覆盖评估、开篇、局部场景或已选序列概念',
    );
    expect(definitions.get('media-production')).toContain('来源—决定映射');
    expect(definitions.get('media-production')).toContain('对应行的“依据性质”');
    expect(definitions.get('media-production')).toContain('不创建审批对象、gate、预算授权');
    expect(definitions.get('media-production')).toContain('只推荐一个能推进整体路线的下一操作');
    expect(definitions.get('media-production')).toContain('覆盖当前制作范围的权威镜头表');
    expect(definitions.get('media-production')).toContain('逐镜盘点该范围消费的剧情节拍与世界规则');
    expect(definitions.get('media-production')).toContain('每个镜头必须被具体覆盖');
    expect(definitions.get('media-production')).toContain('单张图只满足它实际呈现且已绑定的职责');
    expect(definitions.get('media-production')).toContain('PV 的当前制作范围默认是整支 PV');
    expect(definitions.get('media-production')).toContain('逐镜生成意图缺口');
    expect(definitions.get('storyboard')).toContain('可直接更新的 Markdown 场景/镜头表');
    expect(definitions.get('storyboard')).toContain(
      'one `SHxx` row is one continuous observable take',
    );
    expect(definitions.get('storyboard')).toContain('A reference is bound only when the row names');
    expect(definitions.get('storyboard')).toContain('They do not contain duration, camera travel');
    expect(definitions.get('storyboard')).toContain(
      'they are document labels, not a new domain model or workflow state',
    );
    expect(definitions.get('media-selection')).toContain('建议本身不等于用户批准或项目写入');
    expect(definitions.get('media-preparation')).toContain('不能冒充已准备首帧');
    expect(definitions.get('media-preparation')).toContain('验收不得放宽上游创意合同');
    expect(definitions.get('media-preparation')).toContain('不要求预算估算或预算授权');
    expect(definitions.get('media-preparation')).toContain('不要生成候选调用包');
    expect(definitions.get('media-preparation')).toContain('建立紧凑的逐镜生产输入表');
    expect(definitions.get('media-preparation')).toContain('按复用价值和成本推进');
    expect(definitions.get('media-preparation')).toContain('一组兼容素材或逐镜提示词缺口');
    expect(definitions.get('media-preparation')).toContain('称为预处理完成');
    expect(definitions.get('media-preparation')).toContain(
      '不得把尚未分析的镜头合并成“后续再准备”',
    );
    expect(definitions.get('media-preparation')).toContain('没有真实等价素材时就是关键缺口');
    expect(definitions.get('media-preparation')).toContain('不能作为阶段 authority');
    expect(definitions.get('media-preparation')).toContain('只描述一个时刻的图像提示词');
    expect(definitions.get('media-preparation')).toContain('逐镜生产输入表');
    expect(definitions.get('media-preparation')).toContain('剧情节拍与适用世界规则');
    expect(definitions.get('media-preparation')).toContain('“有一张氛围图”不等于基础参考完整');
    expect(definitions.get('media-preparation')).toContain('不需要图像操作');
    expect(definitions.get('media-preparation')).toContain('全部逐镜生成意图必须已经完成');
    expect(definitions.get('media-preparation')).toContain('图像提示词与视频提示词不能合并');
    expect(definitions.get('media-preparation')).toContain('不等于整个预处理阶段完成');
    expect(definitions.get('media-preparation')).toContain(
      '内部必须按当前 schema 编译完整 Tool 调用封装',
    );
    expect(definitions.get('media-preparation')).toContain('默认面向创作者的交接');
    expect(definitions.get('media-preparation')).toContain('不打印 Tool 名、字段名');
    expect(definitions.get('video')).toContain('图像驱动视频必须绑定一个实际首帧');
    expect(definitions.get('video')).toContain('不交付看似可提交的候选调用包');

    await provider.dispose();
  });

  it('keeps adapted creative methods on demand without importing upstream runtime authority', async () => {
    const skillRoot = resolve(import.meta.dirname, '../../skills/skills');
    const packages = [
      {
        name: 'storyboard',
        guides: [
          'references/cinematic-shot-design.md',
          'references/visual-continuity.md',
          'references/reference-video-analysis.md',
        ],
      },
      {
        name: 'video',
        guides: ['references/single-clip-prompt.md'],
      },
    ];
    const provider = isolatedProvider(skillRoot);
    const observation = await provider.list({ cwd: skillRoot });
    const candidates = Array.isArray(observation) ? observation : observation.candidates;

    for (const packageDefinition of packages) {
      const candidate = candidates.find((item) => item.name === packageDefinition.name);
      if (candidate === undefined) {
        throw new Error(`Builtin ${packageDefinition.name} Skill was not found.`);
      }
      const definition = await provider.get(candidate, { cwd: skillRoot });
      if (definition === undefined) {
        throw new Error(`Builtin ${packageDefinition.name} Skill did not load.`);
      }
      const packageRoot = join(skillRoot, packageDefinition.name);
      expect(definition).toMatchObject({
        name: packageDefinition.name,
        resourceBase: { kind: 'directory', path: packageRoot },
      });
      for (const guidePath of packageDefinition.guides) {
        const guide = await readFile(join(packageRoot, ...guidePath.split('/')), 'utf8');
        expect(definition.content).toContain(`](${guidePath})`);
        expect(definition.content).not.toContain(guide);
        expect(guide).not.toMatch(
          /~\/(?:\.kunpeng|\.openclaw)|DMXAPI_KEY|runninghub\.py|@图片|api[_-]?key/iu,
        );
      }
    }
    await provider.dispose();
  });

  it('preserves the locked DSH rank order across every filesystem source and runtime Skills', async () => {
    const context = new Context();
    const registry = new SkillRegistry(context);
    const providerName = 'openneko-rank-contract';
    const candidates = [
      rankedCandidate(providerName, 'bundled', 600),
      rankedCandidate(providerName, 'user-agents', 500),
      rankedCandidate(providerName, 'user-dsh', 400),
      rankedCandidate(providerName, 'custom', 300),
      rankedCandidate(providerName, 'project-agents', 200),
      rankedCandidate(providerName, 'project-dsh', 100),
    ];
    const disposeProvider = registry.registerProvider(() => ({
      name: providerName,
      list: async () => candidates,
      get: async (candidate) => ({
        ...candidate,
        content: `# ${candidate.source}`,
      }),
    }));
    const disposeRuntime = registry.register({
      name: 'ranked-skill',
      description: 'runtime',
      source: 'runtime',
      content: '# runtime',
    });

    await expect(registry.list()).resolves.toEqual([
      expect.objectContaining({ name: 'ranked-skill', source: 'project-dsh' }),
    ]);
    await expect(registry.get('ranked-skill')).resolves.toMatchObject({
      source: 'project-dsh',
      content: '# project-dsh',
    });
    disposeRuntime();
    disposeProvider();
  });

  it('isolates a malformed entry without hiding valid sibling Skills', async () => {
    const root = await fixtureRoot();
    await writeDirectorySkill(root, 'valid-skill', 'Valid skill.');
    await mkdir(join(root, 'invalid-skill'));
    await writeFile(
      join(root, 'invalid-skill', 'SKILL.md'),
      '---\nname: Invalid Skill\ndescription: Invalid.\n---\n# Invalid\n',
      'utf8',
    );
    const provider = isolatedProvider(root);

    const observation = await provider.list({ cwd: root });
    const candidates = Array.isArray(observation) ? observation : observation.candidates;

    expect(candidates.map((item) => item.name)).toEqual(['valid-skill']);
    await provider.dispose();
  });
});

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'openneko-dsh-skill-contract-'));
  roots.push(root);
  return root;
}

function isolatedProvider(root: string): FileSystemSkillProvider {
  const context = new Context();
  const controller = new AbortController();
  return new FileSystemSkillProvider(
    context,
    { signal: controller.signal, invalidate: () => undefined },
    {
      providerName: 'openneko-contract-fixture',
      includeDefaultRoots: false,
      customSkillDirs: [root],
      watch: false,
    },
  );
}

function rankedCandidate(provider: string, source: string, rank: number): SkillCandidate {
  return {
    name: 'ranked-skill',
    description: source,
    invocation: { modelInvocable: true, userInvocable: true },
    source,
    provider,
    rank,
    locator: source,
  };
}

function expectBilingualGuidance(
  content: string,
  path: string,
  chineseHeading: '中文方法' | '中文指南',
): void {
  const chineseIndex = content.indexOf(`## ${chineseHeading}`);
  const englishIndex = content.indexOf('## English guidance');
  expect(chineseIndex, `${path} Chinese guidance`).toBeGreaterThanOrEqual(0);
  expect(englishIndex, `${path} English guidance`).toBeGreaterThan(chineseIndex);
  expect(content.slice(chineseIndex, englishIndex), `${path} Chinese content`).toMatch(
    /\p{Script=Han}/u,
  );
  expect(content.slice(englishIndex), `${path} English content`).toMatch(/[A-Za-z]/u);
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as Error & { readonly code?: string }).code === 'ENOENT'
  );
}

function expectBilingualAgentOverlay(content: string, path: string): void {
  const interfaceLines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^(display_name|short_description|default_prompt):/u.test(line));
  expect(interfaceLines, `${path} interface fields`).toHaveLength(3);
  for (const line of interfaceLines) {
    const value = line
      .slice(line.indexOf(':') + 1)
      .trim()
      .replace(/^['"]|['"]$/gu, '');
    expect(value, `${path} Chinese-first interface value`).toMatch(/^\p{Script=Han}/u);
    expect(value, `${path} English-equivalent interface value`).toMatch(/[A-Za-z]/u);
  }
}

async function writeDirectorySkill(
  root: string,
  name: string,
  description: string,
  invocation = '',
): Promise<void> {
  await mkdir(join(root, name));
  await writeFile(
    join(root, name, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n${invocation}---\n# ${name}\n`,
    'utf8',
  );
}

async function writeFlatSkill(
  root: string,
  name: string,
  description: string,
  invocation = '',
): Promise<void> {
  await writeFile(
    join(root, `${name}.md`),
    `---\nname: ${name}\ndescription: ${description}\n${invocation}---\n# ${name}\n`,
    'utf8',
  );
}
