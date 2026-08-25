import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const skillRoot = join(repoRoot, '.codex/skills/neko-ui-validation');
const skillPath = join(skillRoot, 'SKILL.md');

describe('neko-ui-validation repository Skill', () => {
  it('declares focused positive and negative triggers with matching UI metadata', async () => {
    const { frontmatter } = parseSkillDocument(await readFile(skillPath, 'utf8'));
    const openaiMetadata = parse(await readFile(join(skillRoot, 'agents/openai.yaml'), 'utf8'));
    const gitignore = await readFile(join(repoRoot, '.gitignore'), 'utf8');

    assert.deepEqual(Object.keys(frontmatter).sort(), ['description', 'name']);
    assert.equal(frontmatter.name, 'neko-ui-validation');
    assert.match(frontmatter.description, /new UI features/u);
    assert.match(frontmatter.description, /changing layout, interaction, or presentation/u);
    assert.match(frontmatter.description, /fixing UI bugs/u);
    assert.match(frontmatter.description, /UI\/UX acceptance or graphical verification/u);
    assert.match(frontmatter.description, /no user-visible impact as not applicable/u);
    assert.match(frontmatter.description, /direct image-capable Agent review/u);

    assert.equal(openaiMetadata.interface?.display_name, 'Neko UI Validation');
    assert.equal(
      openaiMetadata.interface?.short_description,
      'Review UI behavior as advisory visual evidence',
    );
    assert.match(openaiMetadata.interface?.default_prompt ?? '', /\$neko-ui-validation/u);
    assert.match(gitignore, /^!\.codex\/skills\/neko-ui-validation\/$/mu);
    assert.match(gitignore, /^!\.codex\/skills\/neko-ui-validation\/\*\*$/mu);
  });

  it('defines one complete advisory workflow with a fail-visible UI report', async () => {
    const { body } = parseSkillDocument(await readFile(skillPath, 'utf8'));
    const requiredSections = [
      '## Decide Applicability',
      '## Build The Acceptance Inventory',
      '## Choose The Authoritative Runtime',
      '## Run Functional Validation',
      '## Run Visual Validation',
      '## Protect Adjacent Behavior',
      '## Decide The Result',
      '## Report',
    ];

    for (const section of requiredSections) {
      assert.equal(countOccurrences(body, section), 1, `${section} must have one canonical owner`);
    }

    for (const outcome of ['passed', 'failed', 'blocked', 'not-applicable']) {
      assert.ok(body.includes(`\`${outcome}\``), `missing outcome: ${outcome}`);
    }
    assert.match(body, /Every delivery claim must map to at least one inventory item/u);
    assert.match(body, /normal user-operable input/u);
    assert.match(body, /A functional pass does not prove appearance/u);
    assert.match(body, /inspect its pixels directly/u);
    assert.match(body, /Confirm that the artifact depicts the intended state/u);
    assert.match(body, /Do not infer visual success from an artifact reference/u);
    assert.match(body, /Map each inspected artifact to one acceptance item/u);
    assert.match(body, /unsupported aesthetic score/u);
    assert.match(body, /Functional readiness does not prove visual settlement/u);
    assert.match(body, /expected black intro frame is not a rendering failure/u);
    assert.match(body, /unresolved loading or source-timing ambiguity is blocked/u);
    assert.match(body, /derive the midpoint from its current finite duration/u);
    assert.match(body, /normal user seek control/u);
    assert.match(body, /state-mismatched visual evidence as blocked/u);
    assert.match(body, /smallest existing workflow/u);
    assert.match(body, /cannot replace the owning runtime/u);
    assert.match(body, /Do not declare UI validation passed/u);
    assert.match(body, /Keep this result advisory/u);
    assert.match(body, /does not change code-quality gate status/u);
    assert.match(body, /block implementation completion, commit, merge, or release/u);
    assert.match(body, /out of generic continuous-integration and code-gate workflows/u);
  });

  it('keeps runtime protocols and product-private contracts out of Skill content', async () => {
    const { body } = parseSkillDocument(await readFile(skillPath, 'utf8'));
    const prohibitedPatterns = [
      /```/u,
      /\b(?:Playwright|Computer Use|CDP|Chrome DevTools|WebDriver)\b/u,
      /\b(?:pnpm|npm|npx|node)\b/u,
      /--[a-z][a-z-]*/u,
      /\b(?:waitForSelector|data-testid|openneko-functional)\b/u,
      /\b(?:ContentLocator|SkillHost|ToolDefinition)\b/u,
      /agents\/neko\.yaml|@neko\//u,
      /\b(?:schemaVersion|formatVersion|contractVersion|optimization_version)\b/u,
      /\b(?:polling protocol|command schema|parameter schema)\b/iu,
    ];

    for (const pattern of prohibitedPatterns) {
      assert.doesNotMatch(body, pattern);
    }

    await assert.rejects(
      access(join(repoRoot, 'packages/skills/skills/neko-ui-validation/SKILL.md')),
    );
  });

  it('delegates focused UI evidence from the repository quality review', async () => {
    const qualityReview = await readFile(
      join(repoRoot, '.codex/skills/neko-quality-review/SKILL.md'),
      'utf8',
    );
    const repositoryInstructions = await readFile(join(repoRoot, 'AGENTS.md'), 'utf8');

    assert.match(qualityReview, /use `neko-ui-validation`/u);
    assert.match(qualityReview, /failed or blocked UI result as an advisory finding or follow-up/u);
    assert.match(
      qualityReview,
      /UI reference review: when run, inspect the `neko-ui-validation` applicability decision/u,
    );
    assert.match(qualityReview, /without making this advisory review a code gate/u);
    assert.doesNotMatch(qualityReview, /## Build The Acceptance Inventory/u);
    assert.match(
      repositoryInstructions,
      /推荐使用 `.codex\/skills\/neko-ui-validation\/SKILL.md` 建立受影响功能清单/u,
    );
    assert.match(
      repositoryInstructions,
      /UI 报告自身存在失败、阻塞、缺失或未执行项时不得声明该报告通过/u,
    );
    assert.match(repositoryInstructions, /Agent 实际读取当前图像证据并记录可观察结论/u);
    assert.match(
      repositoryInstructions,
      /不得根据截图文件存在、文件名、场景成功、DOM 数据或历史证据/u,
    );
    assert.match(repositoryInstructions, /这些结果仅作非阻塞参考/u);
    assert.match(repositoryInstructions, /不得影响代码质量门禁、任务完成、提交、合并或发布/u);
    assert.match(repositoryInstructions, /非阻塞 UI 参考验证不属于该完成条件/u);
  });

  it('codifies the canonical workflow in contributor and quality standards', async () => {
    const contributingCn = await readFile(join(repoRoot, 'CONTRIBUTING_CN.md'), 'utf8');
    const contributingEn = await readFile(join(repoRoot, 'CONTRIBUTING.md'), 'utf8');

    assert.match(contributingCn, /\.codex\/skills\/neko-ui-validation\/SKILL\.md/u);
    assert.match(contributingCn, /建立受影响功能清单/u);
    assert.match(contributingCn, /功能、视觉和相邻回归检查/u);
    assert.match(contributingCn, /真实 Electron\s*产品路径为权威证据/u);
    assert.match(contributingCn, /任何必需项失败、阻塞、缺失或未执行时不得声明\s*UI 验收通过/u);
    assert.match(contributingCn, /`not-applicable`/u);
    assert.match(contributingCn, /Agent 实际读取当前图像证据/u);
    assert.match(contributingCn, /截图存在、文件名或场景成功不能替代视觉审阅/u);
    assert.match(contributingCn, /UI 验证结论仅作非阻塞参考/u);

    assert.match(contributingEn, /\.codex\/skills\/neko-ui-validation\/SKILL\.md/u);
    assert.match(contributingEn, /affected-function inventory/u);
    assert.match(contributingEn, /functional, visual, and adjacent-regression\s+checks/u);
    assert.match(contributingEn, /real\s+Electron product path/u);
    assert.match(
      contributingEn,
      /must not\s+pass while any required item is failed, blocked, missing, or unexecuted/u,
    );
    assert.match(contributingEn, /`not-applicable`/u);
    assert.match(contributingEn, /directly inspected by an image-capable Agent/u);
    assert.match(contributingEn, /do not replace visual review/u);
    assert.match(contributingEn, /UI validation is advisory/u);
  });

  it('keeps focused Desktop visual states in package-owned scenario evidence', async () => {
    const desktopScenario = await readFile(
      join(repoRoot, 'scripts/desktop-functional/desktop-workbench-scenes.mjs'),
      'utf8',
    );
    const cutScenario = await readFile(
      join(repoRoot, 'packages/cut/webview/functional/desktop-openneko-consumer.mjs'),
      'utf8',
    );
    const previewScenario = await readFile(
      join(repoRoot, 'packages/preview/webview/functional/desktop-openneko-consumer.mjs'),
      'utf8',
    );

    for (const label of [
      'primary-sidebar-compact-large',
      'primary-sidebar-restored-large',
      'settings-workbench-large',
    ]) {
      assert.match(
        desktopScenario,
        new RegExp(`captureSettledScreenshot\\([\\s\\S]*?'${label}'`, 'u'),
      );
    }
    assert.match(desktopScenario, /\.\.\.sidebarScreenshots/u);
    assert.match(desktopScenario, /settingsScreenshot,/u);

    for (const label of [
      'cut-editor-ready',
      'cut-playback-seek-visible',
      'cut-authoring-complete',
    ]) {
      assert.match(cutScenario, new RegExp(`captureSettledScreenshot\\([\\s\\S]*?'${label}'`, 'u'));
    }
    for (const screenshot of ['readyScreenshot', 'seekScreenshot', 'authoringScreenshot']) {
      assert.match(cutScenario, new RegExp(`\\b${screenshot},`, 'u'));
    }
    assert.match(cutScenario, /interaction\.kind === 'playback-toggle' && interaction\.trusted/u);
    assert.match(cutScenario, /Cut P0\/P1 authoring evidence is incomplete/u);
    assert.match(cutScenario, /seekCutToTimelineMidpoint/u);
    assert.match(cutScenario, /const midpointSeconds = durationSeconds \/ 2/u);
    assert.match(cutScenario, /const replacementSeconds = durationSeconds \* 0\.625/u);
    assert.match(cutScenario, /const ACTIVE_CUT_ROOT_SELECTOR =/u);
    assert.match(cutScenario, /const ACTIVE_CUT_TIMELINE_SELECTOR =/u);
    assert.match(cutScenario, /viewId: 'cut:authoring-reopened'/u);
    assert.match(
      cutScenario,
      /document\.querySelector\(\$\{JSON\.stringify\(ACTIVE_CUT_ROOT_SELECTOR\)\}\)/u,
    );
    assert.match(
      cutScenario,
      /click\(`\$\{ACTIVE_CUT_TIMELINE_SELECTOR\} \.cut-basic-ruler-tick`, target\.tickIndex\)/u,
    );
    assert.match(
      cutScenario,
      /`\$\{ACTIVE_CUT_TIMELINE_SELECTOR\} \.cut-basic-ruler-tick`,\s*seekTarget\.replacementTickIndex/u,
    );
    assert.doesNotMatch(cutScenario, /document\.querySelector\('\[data-owner-root="cut"\]'\)/u);
    assert.doesNotMatch(
      cutScenario,
      /document\.querySelectorAll\('\[data-owner-root="cut"\] video'\)/u,
    );
    assert.doesNotMatch(cutScenario, /xRatio: 0\.25/u);
    assert.doesNotMatch(cutScenario, /\.currentTime\s*=/u);

    for (const key of ['image', 'audio', 'video', 'pdf', 'glb', 'gltf']) {
      assert.match(previewScenario, new RegExp(`key: '${key}'`, 'u'));
    }
    assert.match(
      previewScenario,
      /captureSettledScreenshot\(screenshot, `preview-\$\{definition\.key\}-ready`\)/u,
    );
    assert.match(previewScenario, /screenshots,/u);
    assert.match(previewScenario, /viewer\.ready !== true/u);
    assert.match(previewScenario, /releasedStatuses\.some\(\(status\) => status !== 0\)/u);
    assert.match(previewScenario, /positionPreviewVideoAtMidpoint/u);
    assert.match(previewScenario, /const midpoint = initial\.duration \/ 2/u);
    assert.match(previewScenario, /div\[role="slider"\]/u);
    assert.doesNotMatch(previewScenario, /\.currentTime\s*=/u);

    for (const scenario of [desktopScenario, cutScenario, previewScenario]) {
      assert.match(scenario, /const VISUAL_SETTLE_MILLISECONDS = 1_000/u);
      assert.match(
        scenario,
        /async function captureSettledScreenshot\(screenshot, label\)[\s\S]*?await delay\(VISUAL_SETTLE_MILLISECONDS\);[\s\S]*?return screenshot\(label\);/u,
      );
    }
  });
});

function parseSkillDocument(source) {
  const match = /^---\n(?<frontmatter>[\s\S]*?)\n---\n(?<body>[\s\S]*)$/u.exec(source);
  assert.ok(match?.groups, 'Skill document must contain canonical YAML frontmatter');
  return {
    frontmatter: parse(match.groups.frontmatter),
    body: match.groups.body,
  };
}

function countOccurrences(source, value) {
  return source.split(value).length - 1;
}
