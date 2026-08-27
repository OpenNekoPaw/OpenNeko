#!/usr/bin/env node

import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const surfacePath = 'quality/agent-extension-surface.json';
const architecturePaths = [
  'AGENTS.md',
  'docs/architecture/agent.md',
  'docs/architecture/README.md',
];

const dshSkillSourceKinds = [
  'project-dsh',
  'project-agents',
  'runtime',
  'custom',
  'user-dsh',
  'user-agents',
  'bundled',
];

const providerToolNamePattern = /^[a-zA-Z0-9_-]+$/u;

export function validateSurfaceStructure(surface) {
  const findings = [];
  const skill = requireRecord(surface, 'portableSkill', findings);
  const composition = requireRecord(surface, 'compositionPackage', findings);
  const management = requireRecord(surface, 'extensionManagement', findings);
  const mcp = requireRecord(surface, 'mcp', findings);
  const capability = requireRecord(surface, 'hostCapability', findings);
  const standardsSupport = requireRecord(surface, 'standardsSupport', findings);

  expectEqual(skill?.definition, 'dsh-filesystem-skill', 'portableSkill.definition', findings);
  expectEqual(skill?.classification, 'dsh-skill', 'portableSkill.classification', findings);
  expectFalse(skill?.hostManifestRequired, 'portableSkill.hostManifestRequired', findings);
  expectFalse(skill?.mcpRequired, 'portableSkill.mcpRequired', findings);
  expectStringArray(skill?.sourceKinds, dshSkillSourceKinds, 'portableSkill.sourceKinds', findings);
  expectStringArray(
    skill?.layouts,
    ['directory-skill-md', 'flat-markdown'],
    'portableSkill.layouts',
    findings,
  );
  expectStringArray(
    skill?.frontmatter,
    ['name', 'description', 'whenToUse', 'metadata', 'disable-model-invocation', 'user-invocable'],
    'portableSkill.frontmatter',
    findings,
  );
  expectEqual(skill?.multiSkill, true, 'portableSkill.multiSkill', findings);
  expectEqual(
    skill?.relativeResources,
    'on-demand-guidance',
    'portableSkill.relativeResources',
    findings,
  );
  expectEqual(
    composition?.classification,
    'official-dsh-profile',
    'compositionPackage.classification',
    findings,
  );
  expectEqual(
    composition?.requiredOnlyFor,
    'dsh-extension-composition',
    'compositionPackage.requiredOnlyFor',
    findings,
  );
  expectEqual(
    composition?.skillContributionOptional,
    true,
    'skill contribution optional',
    findings,
  );
  expectEqual(composition?.mcpContributionOptional, true, 'MCP contribution optional', findings);

  expectEqual(
    management?.classification,
    'dsh-skill-mcp-projection-only',
    'management classification',
    findings,
  );
  if (
    !Array.isArray(management?.visibleTypes) ||
    management.visibleTypes.length !== 2 ||
    management.visibleTypes[0] !== 'skill' ||
    management.visibleTypes[1] !== 'mcp'
  ) {
    findings.push('extensionManagement.visibleTypes must be exactly ["skill", "mcp"]');
  }
  expectFalse(management?.pluginVisible, 'extensionManagement.pluginVisible', findings);
  expectFalse(
    management?.runtimeContributionAuthority,
    'extensionManagement.runtimeContributionAuthority',
    findings,
  );

  expectEqual(mcp?.classification, 'dsh-owned', 'mcp.classification', findings);
  expectEqual(mcp?.supportedCapability, 'dsh-profile', 'mcp.supportedCapability', findings);
  for (const key of [
    'skillDiscoveryDependency',
    'skillCreationDependency',
    'hostCapabilityDependency',
  ]) {
    expectFalse(mcp?.[key], `mcp.${key}`, findings);
  }
  expectEqual(mcp?.connectionFailureIsolation, 'contribution', 'MCP failure isolation', findings);
  expectFalse(capability?.mcpRequired, 'hostCapability.mcpRequired', findings);
  expectEqual(
    capability?.classification,
    'host-domain-tool-adapter',
    'hostCapability.classification',
    findings,
  );
  expectEqual(
    capability?.runtimeAuthority,
    'owning-domain-application-service',
    'hostCapability.runtimeAuthority',
    findings,
  );
  expectEqual(standardsSupport?.agentSkills, 'dsh-owned', 'Agent Skills support', findings);
  expectEqual(
    standardsSupport?.agentPlugins,
    'official-first-party-only',
    'Agent Plugins support',
    findings,
  );
  expectEqual(standardsSupport?.mcp, 'dsh-owned', 'MCP support', findings);

  collectForbiddenVersionFields(surface, '', findings);
  return findings;
}

export function findForbiddenArchitectureClaims(source, path = '<document>') {
  const findings = [];
  for (const [pattern, diagnostic] of [
    [/agents\/neko\.yaml/u, 'retired private Skill overlay'],
    [/可选\s*Neko overlay/iu, 'retired optional Neko overlay'],
    [
      /Skill[^\n。]*必须[^\n。]*(?:plugin\.json|marketplace\.json|MCP)/iu,
      'mandatory host metadata for Skill',
    ],
    [
      /Skill (?:content|正文)[^\n。]*(?:不写|不得|MUST NOT)[^\n。]*(?:tool name|Tool name|工具名|参数表|Tool 参数教程|concrete Tool tutorials)/iu,
      'DSH-valid public Tool guidance is forbidden',
    ],
    [
      /(?:一次|每次)[^\n。]*(?:仅|只)[^\n。]*(?:一个|one)[^\n。]*(?:主 Skill|primary Skill)/iu,
      'single-primary-Skill restriction',
    ],
    [
      /(?:Skill 数量|Skill 总数|number of Skills)[^\n。]*(?:上限|最多|limit|maximum)/iu,
      'fixed Skill-count restriction',
    ],
    [
      /(?:必须|MUST)[^\n。]*Artifact Profile[^\n。]*(?:才能|before)[^\n。]*(?:Skill|技能)/iu,
      'artifact-profile-first Skill restriction',
    ],
  ]) {
    if (pattern.test(source)) findings.push(`${path}: ${diagnostic}`);
  }
  return findings;
}

export function findRetiredAgentSkillToolClaims(source, path = '<document>') {
  return /\b(?:GetContext|ActivateSkill|DeactivateSkill)\b/u.test(source)
    ? [`${path}: retired Agent Skill Tool protocol`]
    : [];
}

export function validateDshExtensionManagementHostSource(source) {
  const findings = [];
  if (!source.includes('runtime.client.readExtensions()')) {
    findings.push('Extension Management host must project the canonical DSH extension snapshot');
  }
  if (!source.includes('skills:') || !source.includes('mcp:')) {
    findings.push('Extension Management host must project both Skill and MCP catalogs');
  }
  for (const retiredAuthority of [
    'plugin_states',
    'pluginStates',
    'mcp_servers',
    'external_research',
    'plugins:',
  ]) {
    if (source.includes(retiredAuthority)) {
      findings.push(`Extension Management host retains retired authority ${retiredAuthority}`);
    }
  }
  return findings;
}

export function validateCanonicalAgentRegistrationGraph(graph) {
  const findings = [];
  if (!isRecord(graph)) return ['Agent registration graph must be an object'];
  const runtimes = readIdentityList(graph.runtimes, 'runtime', findings);
  const tools = readIdentityList(graph.tools, 'Tool', findings);
  const mcpContributions = readIdentityList(graph.mcpContributions, 'MCP contribution', findings);
  const plugins = readIdentityList(graph.plugins, 'Plugin', findings);

  for (const tool of tools) {
    if (!providerToolNamePattern.test(tool)) {
      findings.push(`Agent registration graph Tool identity ${tool} is not provider-safe`);
    }
  }

  if (runtimes.length !== 1 || runtimes[0] !== 'dsh') {
    findings.push(
      'Agent registration graph must contain exactly one DSH runtime and no Pi runtime',
    );
  }
  expectExactIdentitySet(
    tools,
    [
      'CreateSkill',
      'openneko_canvas',
      'openneko_character',
      'openneko_cut',
      'openneko_document',
      'openneko_generation',
      'openneko_read_image',
      'openneko_world',
    ],
    'Tool',
    findings,
  );
  rejectDuplicateIdentities(mcpContributions, 'MCP contribution', findings);
  expectExactIdentitySet(
    plugins,
    [
      '@neko/agent-dsh-plugin',
      '@neko/canvas-dsh-plugin',
      '@neko/chara-dsh-plugin',
      '@neko/content-dsh-plugin',
      '@neko/cut-dsh-plugin',
      '@neko/dsh-bridge',
      '@neko/generation-dsh-plugin',
      '@neko/world-dsh-plugin',
    ],
    'Plugin',
    findings,
  );
  return findings;
}

export async function checkAgentExtensionSurface(root = repositoryRoot) {
  const findings = [];
  let surface;
  try {
    surface = JSON.parse(await readFile(resolve(root, surfacePath), 'utf8'));
  } catch (error) {
    return {
      status: 'failed',
      checkedEvidence: 0,
      findings: [`${surfacePath}: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  findings.push(...validateSurfaceStructure(surface));
  const evidence = collectEvidencePaths(surface);
  for (const path of evidence) {
    try {
      await access(resolve(root, path));
    } catch {
      findings.push(`${surfacePath}: missing canonical evidence ${path}`);
    }
  }

  for (const path of architecturePaths) {
    try {
      const source = await readFile(resolve(root, path), 'utf8');
      findings.push(...findForbiddenArchitectureClaims(source, path));
    } catch {
      findings.push(`${path}: required architecture document is missing`);
    }
  }

  const stableArchitectureFiles = (await collectFiles(resolve(root, 'docs/architecture'))).filter(
    (path) => path.endsWith('.md'),
  );
  for (const absolutePath of stableArchitectureFiles) {
    const path = normalize(relative(root, absolutePath));
    const source = await readFile(absolutePath, 'utf8');
    findings.push(...findRetiredAgentSkillToolClaims(source, path));
  }

  await checkPortableSkillPackage(root, findings);
  await checkCanonicalSourceEvidence(root, findings);

  return {
    status: findings.length === 0 ? 'passed' : 'failed',
    checkedEvidence: evidence.length,
    findings,
  };
}

async function checkPortableSkillPackage(root, findings) {
  const skillRoot = resolve(root, 'packages/skills/skills');
  const files = await collectFiles(skillRoot);
  const skillDocuments = files.filter((path) => path.endsWith('/SKILL.md'));
  if (skillDocuments.length === 0) {
    findings.push('packages/skills/skills: expected at least one portable SKILL.md');
  }
  for (const path of files) {
    const relativePath = normalize(relative(skillRoot, path));
    if (
      relativePath === '.openneko-plugin/plugin.json' ||
      relativePath.endsWith('/.openneko-plugin/plugin.json') ||
      relativePath === '.mcp.json' ||
      relativePath.endsWith('/.mcp.json') ||
      relativePath === 'agents/neko.yaml' ||
      relativePath.endsWith('/agents/neko.yaml')
    ) {
      findings.push(
        `packages/skills/skills/${relativePath}: portable Skill contains Host protocol`,
      );
    }
  }
  for (const skillDocument of skillDocuments) {
    const skillDirectory = dirname(skillDocument);
    const source = await readFile(skillDocument, 'utf8');
    for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
      const target = match[1]?.trim();
      if (
        target === undefined ||
        target.length === 0 ||
        target.startsWith('#') ||
        /^[a-z][a-z0-9+.-]*:/iu.test(target)
      ) {
        continue;
      }
      const normalizedTarget = target.split('#', 1)[0];
      const absoluteTarget = resolve(skillDirectory, normalizedTarget);
      const relativeTarget = normalize(relative(skillDirectory, absoluteTarget));
      if (relativeTarget === '..' || relativeTarget.startsWith('../')) {
        findings.push(
          `${normalize(relative(root, skillDocument))}: Skill resource link escapes its package: ${target}`,
        );
        continue;
      }
      try {
        await access(absoluteTarget);
      } catch (error) {
        if (!isMissingPathError(error)) throw error;
        findings.push(
          `${normalize(relative(root, skillDocument))}: Skill resource link is missing: ${target}`,
        );
      }
    }
  }
}

async function checkCanonicalSourceEvidence(root, findings) {
  const retiredAuthorities = [
    'packages/agent/runtime/src/pi/skill-host.ts',
    'packages/agent/runtime/src/pi/capability-tool-bridge.ts',
    'packages/agent/runtime/src/extensions/extension-manager.ts',
    'packages/agent/runtime/src/extensions/plugin-runtime.ts',
    'packages/agent/runtime/src/mcp/mcp-client.ts',
    'packages/agent/runtime/src/acp/assets-host-adapter.ts',
    'packages/assets/domain/src/dsh-tool.ts',
    'packages/assets/node/src/agent-dsh-search.ts',
    'packages/assets/dsh-plugin/src/index.ts',
    'packages/automation/contracts/src/local-runtime-management.ts',
    'packages/automation/contracts/src/permission-management.ts',
    'packages/automation/node/src/local-runtime-management.ts',
    'packages/automation/node/src/permission-management.ts',
    'packages/automation/webview/package.json',
    'apps/neko-desktop/src/main/desktop-automation-host-permission.ts',
    'apps/neko-desktop/src/main/desktop-automation-local-runtime-host.ts',
    'apps/neko-desktop/src/renderer/desktop-automation-local-runtime-management-runtime.ts',
    'apps/neko-desktop/src/renderer/desktop-automation-permission-management-runtime.ts',
    'scripts/prepare-automation-runtime-artifact.mjs',
    'scripts/prepare-automation-runtime-cua-node.mjs',
    'scripts/prepare-automation-runtime-cua-spdx.mjs',
  ];
  for (const path of retiredAuthorities) {
    try {
      await access(resolve(root, path));
      findings.push(`${path}: retired OpenNeko runtime authority must remain deleted`);
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
    }
  }

  const bridgeSource = await readFile(resolve(root, 'packages/dsh-bridge/src/index.ts'), 'utf8');
  const extensionManagementHostSource = await readFile(
    resolve(root, 'apps/neko-desktop/src/main/desktop-dsh-extension-management-host.ts'),
    'utf8',
  );
  findings.push(...validateDshExtensionManagementHostSource(extensionManagementHostSource));
  const bridgeManifest = JSON.parse(
    await readFile(resolve(root, 'packages/dsh-bridge/package.json'), 'utf8'),
  );
  const bridgeProfile = await readFile(
    resolve(root, 'packages/dsh-bridge/cordis.patch.yml'),
    'utf8',
  );
  if (!bridgeSource.includes("ctx.provide('opennekoHostTools'")) {
    findings.push('DSH bridge no longer provides the canonical reverse Host Tool port');
  }
  const generationToolsSource = await readFile(
    resolve(root, 'packages/generation/dsh-plugin/src/index.ts'),
    'utf8',
  );
  const agentToolsSource = await readFile(
    resolve(root, 'packages/agent/dsh-plugin/src/index.ts'),
    'utf8',
  );
  const characterToolsSource = await readFile(
    resolve(root, 'packages/chara/dsh-plugin/src/index.ts'),
    'utf8',
  );
  const canvasToolsSource = await readFile(
    resolve(root, 'packages/canvas/dsh-plugin/src/index.ts'),
    'utf8',
  );
  const cutToolsSource = await readFile(
    resolve(root, 'packages/cut/dsh-plugin/src/index.ts'),
    'utf8',
  );
  const documentToolsSource = await readFile(
    resolve(root, 'packages/content/dsh-plugin/src/index.ts'),
    'utf8',
  );
  const generationProfile = await readFile(
    resolve(root, 'packages/generation/dsh-plugin/cordis.patch.yml'),
    'utf8',
  );
  const agentToolsProfile = await readFile(
    resolve(root, 'packages/agent/dsh-plugin/cordis.patch.yml'),
    'utf8',
  );
  const characterProfile = await readFile(
    resolve(root, 'packages/chara/dsh-plugin/cordis.patch.yml'),
    'utf8',
  );
  const worldProfile = await readFile(
    resolve(root, 'packages/world/dsh-plugin/cordis.patch.yml'),
    'utf8',
  );
  const canvasProfile = await readFile(
    resolve(root, 'packages/canvas/dsh-plugin/cordis.patch.yml'),
    'utf8',
  );
  const cutProfile = await readFile(
    resolve(root, 'packages/cut/dsh-plugin/cordis.patch.yml'),
    'utf8',
  );
  const documentProfile = await readFile(
    resolve(root, 'packages/content/dsh-plugin/cordis.patch.yml'),
    'utf8',
  );
  if (/ctx\.tools\.register\s*\(/u.test(bridgeSource)) {
    findings.push('DSH bridge must not register domain Tools');
  }
  if (
    !agentToolsSource.includes('CREATE_SKILL_DSH_TOOL_NAME') ||
    !/ctx\.tools\.register\s*\(/u.test(agentToolsSource)
  ) {
    findings.push('Agent DSH plugin does not register exact CreateSkill');
  }
  if (!agentToolsProfile.includes('@neko/agent-dsh-plugin')) {
    findings.push('Agent DSH plugin profile patch is missing its canonical contribution');
  }
  if (
    !generationToolsSource.includes('GENERATION_DSH_TOOL_NAME') ||
    !generationToolsSource.includes("from '@neko/generation-domain'") ||
    !/ctx\.tools\.register\s*\(/u.test(generationToolsSource)
  ) {
    findings.push('Generation DSH plugin does not register exact openneko_generation');
  }
  if (
    !characterToolsSource.includes('CHARACTER_DSH_TOOL_NAME') ||
    !characterToolsSource.includes("from '@neko/chara-domain/application'") ||
    !/ctx\.tools\.register\s*\(/u.test(characterToolsSource)
  ) {
    findings.push('Character DSH plugin does not register exact openneko_character');
  }
  if (!characterProfile.includes('@neko/chara-dsh-plugin')) {
    findings.push('Character DSH plugin profile patch is missing its canonical contribution');
  }
  const worldToolsSource = await readFile(
    resolve(root, 'packages/world/dsh-plugin/src/index.ts'),
    'utf8',
  );
  if (
    !worldToolsSource.includes('WORLD_DSH_TOOL_NAME') ||
    !/ctx\.tools\.register\s*\(/u.test(worldToolsSource)
  ) {
    findings.push('World DSH plugin does not register exact openneko_world');
  }
  if (!worldProfile.includes('@neko/world-dsh-plugin')) {
    findings.push('World DSH plugin profile patch is missing its canonical contribution');
  }
  if (
    !canvasToolsSource.includes('CANVAS_DSH_TOOL_NAME') ||
    !canvasToolsSource.includes("from '@neko/canvas-domain'") ||
    !/ctx\.tools\.register\s*\(/u.test(canvasToolsSource)
  ) {
    findings.push('Canvas DSH plugin does not register exact openneko_canvas');
  }
  if (
    !cutToolsSource.includes('CUT_DSH_TOOL_NAME') ||
    !cutToolsSource.includes("from '@neko/cut-domain'") ||
    !/ctx\.tools\.register\s*\(/u.test(cutToolsSource)
  ) {
    findings.push('Cut DSH plugin does not register exact openneko_cut');
  }
  if (
    !documentToolsSource.includes('DOCUMENT_DSH_TOOL_NAME') ||
    !documentToolsSource.includes('CONTENT_IMAGE_DSH_TOOL_NAME') ||
    !documentToolsSource.includes("from '@neko/content-domain/document'") ||
    !/ctx\.tools\.register\s*\(/u.test(documentToolsSource) ||
    !/imageCtx\.tools\.register\s*\(/u.test(documentToolsSource)
  ) {
    findings.push(
      'Content DSH plugin does not register exact openneko_document and openneko_read_image Tools',
    );
  }
  if (
    /openneko_(?:assets|plugin|skill|mcp)\b/u.test(
      `${generationToolsSource}\n${characterToolsSource}\n${canvasToolsSource}\n${cutToolsSource}\n${documentToolsSource}`,
    )
  ) {
    findings.push('Official DSH plugins register an unsupported domain Tool name');
  }
  if (bridgeManifest.dependencies?.['@deepseek-ai/dsh-acp'] !== undefined) {
    findings.push(
      'DSH bridge must remain the sole ACP plugin instead of mounting upstream dsh-acp',
    );
  }
  if (!bridgeProfile.includes("name: '@neko/dsh-bridge'")) {
    findings.push('DSH bridge profile no longer mounts the canonical OpenNeko bridge');
  }
  findings.push(
    ...validateCanonicalAgentRegistrationGraph({
      runtimes: ['dsh'],
      tools: [
        ...Array(countMatches(agentToolsSource, /ctx\.tools\.register\s*\(/gu)).fill('CreateSkill'),
        ...Array(countMatches(characterToolsSource, /ctx\.tools\.register\s*\(/gu)).fill(
          'openneko_character',
        ),
        ...Array(countMatches(generationToolsSource, /ctx\.tools\.register\s*\(/gu)).fill(
          'openneko_generation',
        ),
        ...Array(countMatches(canvasToolsSource, /ctx\.tools\.register\s*\(/gu)).fill(
          'openneko_canvas',
        ),
        ...Array(countMatches(cutToolsSource, /ctx\.tools\.register\s*\(/gu)).fill('openneko_cut'),
        ...Array(countMatches(documentToolsSource, /ctx\.tools\.register\s*\(/gu)).fill(
          'openneko_document',
        ),
        ...Array(countMatches(documentToolsSource, /imageCtx\.tools\.register\s*\(/gu)).fill(
          'openneko_read_image',
        ),
        ...Array(countMatches(worldToolsSource, /ctx\.tools\.register\s*\(/gu)).fill(
          'openneko_world',
        ),
      ],
      mcpContributions: [],
      plugins: [
        bridgeProfile,
        agentToolsProfile,
        characterProfile,
        worldProfile,
        generationProfile,
        canvasProfile,
        cutProfile,
        documentProfile,
      ].flatMap(readOpenNekoProfilePluginNames),
    }),
  );
}

function readIdentityList(value, label, findings) {
  if (!Array.isArray(value)) {
    findings.push(`Agent registration graph ${label} identities must be an array`);
    return [];
  }
  const identities = [];
  for (const identity of value) {
    if (typeof identity !== 'string' || identity.trim().length === 0 || identity.includes('*')) {
      findings.push(`Agent registration graph contains an invalid or wildcard ${label} identity`);
      continue;
    }
    identities.push(identity);
  }
  return identities;
}

function expectExactIdentitySet(actual, expected, label, findings) {
  rejectDuplicateIdentities(actual, label, findings);
  const normalized = [...new Set(actual)].sort();
  if (JSON.stringify(normalized) !== JSON.stringify(expected)) {
    findings.push(
      `Agent registration graph ${label} identities must be ${JSON.stringify(expected)}`,
    );
  }
}

function rejectDuplicateIdentities(identities, label, findings) {
  const seen = new Set();
  for (const identity of identities) {
    if (seen.has(identity)) {
      findings.push(`Agent registration graph contains duplicate ${label} identity ${identity}`);
    }
    seen.add(identity);
  }
}

export function readOpenNekoProfilePluginNames(source) {
  return [...source.matchAll(/^\s+name:\s+['"](@neko\/[^'"]+)['"]\s*$/gmu)].map(
    (match) => match[1],
  );
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

async function collectFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(path)));
    else if (entry.isFile()) files.push(normalize(path));
  }
  return files;
}

function collectEvidencePaths(value) {
  const paths = [];
  if (Array.isArray(value)) {
    for (const item of value) paths.push(...collectEvidencePaths(item));
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'evidence' && Array.isArray(item)) {
        for (const path of item) if (typeof path === 'string') paths.push(path);
      } else {
        paths.push(...collectEvidencePaths(item));
      }
    }
  }
  return [...new Set(paths)].sort();
}

function collectForbiddenVersionFields(value, prefix, findings) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectForbiddenVersionFields(item, `${prefix}[${index}]`, findings),
    );
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (['version', 'schemaVersion', 'formatVersion', 'contractVersion'].includes(key)) {
      findings.push(`${surfacePath}: forbidden internal version field ${path}`);
    }
    collectForbiddenVersionFields(item, path, findings);
  }
}

function requireRecord(value, key, findings) {
  const result = isRecord(value) ? value[key] : undefined;
  if (!isRecord(result)) {
    findings.push(`${surfacePath}: ${key} must be an object`);
    return undefined;
  }
  return result;
}

function expectFalse(value, label, findings) {
  expectEqual(value, false, label, findings);
}

function expectStringArray(actual, expected, label, findings) {
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    findings.push(`${surfacePath}: ${label} must be ${JSON.stringify(expected)}`);
  }
}

function expectEqual(actual, expected, label, findings) {
  if (actual !== expected) {
    findings.push(`${surfacePath}: ${label} must be ${JSON.stringify(expected)}`);
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingPathError(error) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function normalize(value) {
  return value.replaceAll('\\', '/');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkAgentExtensionSurface();
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (result.status === 'failed') {
    process.stderr.write(output);
    process.exitCode = 1;
  } else {
    process.stdout.write(output);
  }
}
