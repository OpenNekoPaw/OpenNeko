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
  const pluginState = requireRecord(surface, 'pluginState', findings);
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
    'portable-plugin-subset',
    'compositionPackage.classification',
    findings,
  );
  expectEqual(
    composition?.requiredOnlyFor,
    'shared-install-lifecycle',
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

  expectFalse(pluginState?.packageBytesAuthority, 'pluginState.packageBytesAuthority', findings);
  expectFalse(
    pluginState?.requiredForPortableSkill,
    'pluginState.requiredForPortableSkill',
    findings,
  );
  expectEqual(management?.classification, 'management-only', 'management classification', findings);
  expectFalse(
    management?.runtimeContributionAuthority,
    'extensionManagement.runtimeContributionAuthority',
    findings,
  );

  expectEqual(mcp?.classification, 'partial-optional-adapter', 'mcp.classification', findings);
  expectEqual(mcp?.supportedCapability, 'tools', 'mcp.supportedCapability', findings);
  for (const key of [
    'skillDiscoveryDependency',
    'skillCreationDependency',
    'hostCapabilityDependency',
  ]) {
    expectFalse(mcp?.[key], `mcp.${key}`, findings);
  }
  expectEqual(mcp?.connectionFailureIsolation, 'contribution', 'MCP failure isolation', findings);
  expectFalse(capability?.mcpRequired, 'hostCapability.mcpRequired', findings);
  expectEqual(standardsSupport?.agentSkills, 'core-supported', 'Agent Skills support', findings);
  expectEqual(
    standardsSupport?.agentPlugins,
    'not-conformant-host-extension-only',
    'Agent Plugins support',
    findings,
  );
  expectEqual(standardsSupport?.mcp, 'partial-tools-client', 'MCP support', findings);

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
  const skillHost = await readFile(
    resolve(root, 'packages/agent/runtime/src/pi/skill-host.ts'),
    'utf8',
  );
  if (!skillHost.includes('loadSourcedSkills')) {
    findings.push('Pi SkillHost no longer uses the canonical portable Skill loader');
  }
  if (/from ['"][^'"]*\/mcp(?:\/|['"])/u.test(skillHost)) {
    findings.push('Pi SkillHost imports MCP and no longer preserves Skill/MCP independence');
  }

  const extensionManager = await readFile(
    resolve(root, 'packages/agent/runtime/src/extensions/extension-manager.ts'),
    'utf8',
  );
  if (!extensionManager.includes("resolve(pluginRoot, 'mcp.json')")) {
    findings.push('Extension parser no longer discovers the fixed optional MCP document');
  }
  if (!extensionManager.includes("resolve(pluginRoot, 'skills')")) {
    findings.push('Extension parser no longer discovers the fixed optional Skill root');
  }

  const pluginRuntime = await readFile(
    resolve(root, 'packages/agent/runtime/src/extensions/plugin-runtime.ts'),
    'utf8',
  );
  if (!pluginRuntime.includes('state.skillReady || state.connectedServerIds.length > 0')) {
    findings.push('Plugin readiness no longer proves Skill and MCP can become ready independently');
  }
  if (!pluginRuntime.includes("state.failures.push('mcp-connect-failed')")) {
    findings.push('Plugin runtime no longer exposes MCP connection failure locally');
  }
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
