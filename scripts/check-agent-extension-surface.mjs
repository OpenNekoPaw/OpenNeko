#!/usr/bin/env node

import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const surfacePath = 'quality/agent-extension-surface.json';
const architecturePaths = [
  'docs/architecture/adr-agent-skill-creator-and-validation.md',
  'docs/architecture/adr-agent-prompt-skill-validator-boundary.md',
  'docs/architecture/README.md',
];

export function validateSurfaceStructure(surface) {
  const findings = [];
  const skill = requireRecord(surface, 'portableSkill', findings);
  const skillAuthoring = requireRecord(surface, 'skillAuthoringMetadata', findings);
  const allowedTools = requireRecord(skillAuthoring, 'allowedTools', findings);
  const composition = requireRecord(surface, 'compositionPackage', findings);
  const management = requireRecord(surface, 'extensionManagement', findings);
  const mcp = requireRecord(surface, 'mcp', findings);
  const capability = requireRecord(surface, 'hostCapability', findings);
  const standardsSupport = requireRecord(surface, 'standardsSupport', findings);

  expectEqual(skill?.definition, 'SKILL.md', 'portableSkill.definition', findings);
  expectEqual(skill?.classification, 'portable-standard', 'portableSkill.classification', findings);
  expectFalse(skill?.hostManifestRequired, 'portableSkill.hostManifestRequired', findings);
  expectFalse(skill?.mcpRequired, 'portableSkill.mcpRequired', findings);
  expectStringArray(
    skill?.sourceKinds,
    ['builtin', 'personal', 'plugin', 'project'],
    'portableSkill.sourceKinds',
    findings,
  );
  expectEqual(
    allowedTools?.classification,
    'internal-experimental',
    'skillAuthoringMetadata.allowedTools.classification',
    findings,
  );
  expectFalse(
    allowedTools?.runtimeEnforced,
    'skillAuthoringMetadata.allowedTools.runtimeEnforced',
    findings,
  );
  expectEqual(
    allowedTools?.supportClaim,
    'none',
    'skillAuthoringMetadata.allowedTools.supportClaim',
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
    'dsh-projection-only',
    'management classification',
    findings,
  );
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

export function validateCanonicalAgentRegistrationGraph(graph) {
  const findings = [];
  if (!isRecord(graph)) return ['Agent registration graph must be an object'];
  const runtimes = readIdentityList(graph.runtimes, 'runtime', findings);
  const tools = readIdentityList(graph.tools, 'Tool', findings);
  const mcpContributions = readIdentityList(graph.mcpContributions, 'MCP contribution', findings);
  const plugins = readIdentityList(graph.plugins, 'Plugin', findings);

  if (runtimes.length !== 1 || runtimes[0] !== 'dsh') {
    findings.push(
      'Agent registration graph must contain exactly one DSH runtime and no Pi runtime',
    );
  }
  expectExactIdentitySet(
    tools,
    ['openneko.canvas', 'openneko.cut', 'openneko.generation'],
    'Tool',
    findings,
  );
  rejectDuplicateIdentities(mcpContributions, 'MCP contribution', findings);
  expectExactIdentitySet(
    plugins,
    [
      '@neko/canvas-dsh-plugin',
      '@neko/cut-dsh-plugin',
      '@neko/dsh-bridge',
      '@neko/generation-dsh-plugin',
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
}

async function checkCanonicalSourceEvidence(root, findings) {
  const retiredAuthorities = [
    'packages/agent/runtime/src/pi/skill-host.ts',
    'packages/agent/runtime/src/pi/capability-tool-bridge.ts',
    'packages/agent/runtime/src/extensions/extension-manager.ts',
    'packages/agent/runtime/src/extensions/plugin-runtime.ts',
    'packages/agent/runtime/src/mcp/mcp-client.ts',
  ];
  for (const path of retiredAuthorities) {
    try {
      await access(resolve(root, path));
      findings.push(`${path}: retired OpenNeko runtime authority must remain deleted`);
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
    }
  }

  const bridgeSource = await readFile(
    resolve(root, 'packages/dsh-bridge/src/index.ts'),
    'utf8',
  );
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
  const canvasToolsSource = await readFile(
    resolve(root, 'packages/canvas/dsh-plugin/src/index.ts'),
    'utf8',
  );
  const cutToolsSource = await readFile(
    resolve(root, 'packages/cut/dsh-plugin/src/index.ts'),
    'utf8',
  );
  const generationProfile = await readFile(
    resolve(root, 'packages/generation/dsh-plugin/cordis.patch.yml'),
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
  if (/ctx\.tools\.register\s*\(/u.test(bridgeSource)) {
    findings.push('DSH bridge must not register domain Tools');
  }
  if (
    !generationToolsSource.includes('GENERATION_DSH_TOOL_NAME') ||
    !generationToolsSource.includes("from '@neko/generation'") ||
    !/ctx\.tools\.register\s*\(/u.test(generationToolsSource)
  ) {
    findings.push('Generation DSH plugin does not register exact openneko.generation');
  }
  if (
    !canvasToolsSource.includes('CANVAS_DSH_TOOL_NAME') ||
    !canvasToolsSource.includes("from '@neko/canvas-domain'") ||
    !/ctx\.tools\.register\s*\(/u.test(canvasToolsSource)
  ) {
    findings.push('Canvas DSH plugin does not register exact openneko.canvas');
  }
  if (
    !cutToolsSource.includes('CUT_DSH_TOOL_NAME') ||
    !cutToolsSource.includes("from '@neko/cut-domain'") ||
    !/ctx\.tools\.register\s*\(/u.test(cutToolsSource)
  ) {
    findings.push('Cut DSH plugin does not register exact openneko.cut');
  }
  if (
    /openneko\.(?:assets|character|world|plugin|skill|mcp)\b/u.test(
      `${generationToolsSource}\n${canvasToolsSource}\n${cutToolsSource}`,
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
        ...Array(countMatches(generationToolsSource, /ctx\.tools\.register\s*\(/gu)).fill(
          'openneko.generation',
        ),
        ...Array(countMatches(canvasToolsSource, /ctx\.tools\.register\s*\(/gu)).fill(
          'openneko.canvas',
        ),
        ...Array(countMatches(cutToolsSource, /ctx\.tools\.register\s*\(/gu)).fill('openneko.cut'),
      ],
      mcpContributions: [],
      plugins: [bridgeProfile, generationProfile, canvasProfile, cutProfile].flatMap(
        readOpenNekoProfilePluginNames,
      ),
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
