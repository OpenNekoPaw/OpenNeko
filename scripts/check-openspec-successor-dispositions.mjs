#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const retiredChanges = [
  'add-3d-reference-staging',
  'add-ai-screenplay-authoring',
  'add-workspace-canvas-context-bar',
  'adopt-gfm-authoring-and-agent-rendering-surfaces',
  'align-dsh-skill-runtime-semantics',
  'bound-desktop-ui-residency',
  'expand-character-management-preview',
  'extract-generation-domain-package',
  'fix-desktop-agent-shell-regressions',
  'make-epub-preview-viewport-lazy',
  'manage-desktop-creative-documents',
  'optimize-project-management-ui',
  'progressive-creative-surface-loading',
  'refine-character-management-authoring-and-version-graph',
  'refine-world-management-authoring-and-runtime',
  'remove-character-world-manual-refresh',
  'restore-character-dsh-dialogue',
  'restore-dsh-draft-input-catalog',
  'restore-workspace-linked-media-access',
  'separate-companion-and-narrative-character-conversations',
  'share-embedded-preview-surfaces',
  'simplify-resource-entity-character-world-boundaries',
  'stabilize-cut-gop-preview-playback',
  'unify-agent-workspace-board-delivery',
  'unify-domain-authoring-workspaces',
];

const retiredSpecs = [
  'agent-composer-autogrow',
  'agent-dead-public-surface-removal',
  'agent-evaluation-catalog',
  'agent-prompt-image-admission',
  'agent-resource-link-presentation',
  'agent-streaming-render-bounding',
  'asset-center-renderer-lifecycle',
  'canvas-agent-projection-layout',
  'canvas-image-node-intrinsic-sizing',
  'canvas-node-bound-resource-read-ordering',
  'canvas-node-drag-surfaces',
  'canvas-preview-legacy-protocol-removal',
  'canvas-right-pointer-gesture',
  'dead-ui-shared-primitives-removal',
  'desktop-development-bundle-ownership',
  'desktop-local-state-sqlite-migration',
  'desktop-renderer-bootstrap-reliability',
  'desktop-settings-responsive-presentation',
  'desktop-ui-visual-coverage',
  'extension-management-responsive-presentation',
  'legacy-agent-skill-activation-retirement',
  'legacy-timeline-contract-retirement',
  'light-theme-semantic-contrast',
  'live-canvas-theme-redraw',
  'management-catalog-empty-state',
  'management-catalog-presentation',
  'media-local-metadata-package-removal',
  'preview-image-contain-layout',
  'project-catalog-batch-management',
  'project-catalog-scroll',
  'project-conversation-cleanup',
  'unreachable-automation-management-removal',
];

const allowedActiveArtifactPattern =
  /^[^/]+\/(?:\.openspec\.yaml|proposal\.md|design\.md|tasks\.md|specs\/[^/]+\/spec\.md)$/u;

const forbiddenActivePromisePatterns = [
  {
    id: 'standalone-mutable-authoring',
    pattern:
      /Standalone Character and World authoring SHALL|A standalone Character SHALL use|standalone Character library or an authorized|standalone World library or one exact|authorized standalone Character library|authorized standalone World library/iu,
  },
  {
    id: 'workspace-as-product-intent',
    pattern:
      /Assistant,\s*Authoring,\s*Character Dialogue,\s*and World Experience|Workspace as (?:a )?(?:peer )?product intent/iu,
  },
  {
    id: 'duplicate-creation-destination',
    pattern:
      /Management SHALL offer (?:explicit )?quick|quick generation SHALL use|quick-generation action through|chooses Quick Generate|Global Assistant creates a standalone draft/iu,
  },
  {
    id: 'mandatory-content-root',
    pattern:
      /A Content Project Workspace SHALL support|exact Content Project Workspace root|Content Project Workspace SHALL be the authoring authority/iu,
  },
  {
    id: 'conversation-navigation-creates-durable-conversation',
    pattern:
      /Conversation (?:navigation|entry) SHALL (?:create|materialize) (?:a )?(?:durable )?Agent Conversation/iu,
  },
  {
    id: 'conflicting-import-placement',
    pattern:
      /explicit(?:ly authorized)? standalone-library or project-local destination|standalone\/project-local destination union/iu,
  },
  {
    id: 'direct-domain-product-destinations',
    pattern:
      /Desktop SHALL expose direct Project, Character, and World destinations|application sidebar SHALL expose lightweight Projects, Conversations, Characters, and Worlds sections/iu,
  },
];

export function auditOpenSpecResidue(input) {
  const violations = [];

  for (const change of input.activeChanges) {
    if (!input.retiredChanges.includes(change)) continue;
    violations.push({
      kind: 'retired-change-residue',
      path: change,
      detail: 'A superseded proposal must not remain in the active area.',
    });
  }

  for (const change of input.archivedChanges) {
    violations.push({
      kind: 'archived-proposal-residue',
      path: `archive/${change}`,
      detail:
        'Completed proposal history must be removed after canonical requirements are promoted.',
    });
  }

  for (const spec of input.canonicalSpecs ?? []) {
    if (!input.retiredSpecs?.includes(spec)) continue;
    violations.push({
      kind: 'detailed-canonical-spec-residue',
      path: `specs/${spec}`,
      detail: 'Local implementation detail must not return as a canonical product specification.',
    });
  }

  for (const path of input.forbiddenDocumentRoots ?? []) {
    violations.push({
      kind: 'noncanonical-document-root',
      path,
      detail: 'Research, status, audit, and implementation-history documents are not retained.',
    });
  }

  for (const path of input.activeArtifactPaths ?? []) {
    if (allowedActiveArtifactPattern.test(path)) continue;
    violations.push({
      kind: 'detailed-active-artifact',
      path,
      detail:
        'Active changes may contain only proposal, design, product milestones, delta specs, and OpenSpec metadata.',
    });
  }

  for (const document of input.documents) {
    if (document.path.endsWith('/tasks.md')) {
      const taskLines = document.content.match(/^- \[[ xX]\] .+$/gmu) ?? [];
      const openTaskLines = taskLines.filter((line) => line.startsWith('- [ ] '));
      if (taskLines.length > 8) {
        violations.push({
          kind: 'detailed-task-ledger',
          path: document.path,
          detail: `Active proposals may define at most 8 product milestones; found ${taskLines.length}.`,
        });
      }
      if (taskLines.length > 0 && openTaskLines.length === 0) {
        violations.push({
          kind: 'completed-proposal-residue',
          path: document.path,
          detail:
            'A proposal with no remaining product milestone must be removed from the active area.',
        });
      }
    }
    for (const block of collectActivePromiseBlocks(document)) {
      for (const { id, pattern } of input.forbiddenActivePromisePatterns) {
        if (!pattern.test(block.content)) continue;
        violations.push({
          kind: 'active-retired-promise',
          path: document.path,
          detail: `Active ${block.kind} '${block.label}' reintroduces retired promise '${id}'.`,
        });
      }
    }
  }

  return violations;
}

function runRepositoryAudit(repoRoot) {
  const changesRoot = resolve(repoRoot, 'openspec/changes');
  const activeChanges = collectChangeDirectories(changesRoot).filter(
    (change) => change !== 'archive',
  );
  const archiveRoot = join(changesRoot, 'archive');
  const archivedChanges = collectEntries(archiveRoot);
  const canonicalSpecs = collectChangeDirectories(resolve(repoRoot, 'openspec/specs'));
  const forbiddenDocumentRoots = ['docs/research', 'docs/status'].filter((path) =>
    existsSync(resolve(repoRoot, path)),
  );
  const activeArtifactPaths = collectActiveArtifactPaths(changesRoot, activeChanges);
  const documents = collectMarkdownDocuments(changesRoot, activeChanges);
  return auditOpenSpecResidue({
    activeChanges,
    activeArtifactPaths,
    archivedChanges,
    canonicalSpecs,
    documents,
    forbiddenDocumentRoots,
    forbiddenActivePromisePatterns,
    retiredChanges,
    retiredSpecs,
  });
}

function collectActiveArtifactPaths(changesRoot, activeChanges) {
  return activeChanges
    .flatMap((change) =>
      walkFiles(join(changesRoot, change)).map((absolutePath) =>
        toPosix(relative(changesRoot, absolutePath)),
      ),
    )
    .sort((left, right) => left.localeCompare(right));
}

function collectChangeDirectories(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function collectEntries(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root).sort((left, right) => left.localeCompare(right));
}

function collectActivePromiseBlocks(document) {
  if (document.path.endsWith('/proposal.md') || document.path.endsWith('/design.md')) {
    return [{ content: document.content, kind: 'artifact', label: document.path }];
  }
  if (/\/specs\/[^/]+\/spec\.md$/u.test(document.path)) {
    const sections = document.content.split(/^### Requirement:/gmu).slice(1);
    return sections.map((section) => {
      const content = `### Requirement:${section}`;
      return {
        content,
        kind: 'requirement',
        label: content.match(/^### Requirement:\s*(.+)$/mu)?.[1]?.trim() ?? 'unnamed',
      };
    });
  }
  if (document.path.endsWith('/tasks.md')) {
    return document.content
      .split(/\r?\n/u)
      .filter((line) => /^- \[ \] /u.test(line))
      .map((content) => ({ content, kind: 'task', label: content.slice(6).trim() }));
  }
  return [];
}

function collectMarkdownDocuments(changesRoot, activeChanges) {
  const documents = [];
  for (const change of activeChanges) {
    const changeRoot = join(changesRoot, change);
    for (const absolutePath of walkMarkdown(changeRoot)) {
      const path = toPosix(relative(changesRoot, absolutePath));
      documents.push({
        path,
        content: readFileSync(absolutePath, 'utf8'),
      });
    }
  }
  return documents.sort((left, right) => left.path.localeCompare(right.path));
}

function walkMarkdown(root) {
  return walkFiles(root).filter((path) => path.endsWith('.md'));
}

function walkFiles(root) {
  const paths = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) {
      paths.push(...walkFiles(absolute));
    } else if (entry.isFile()) {
      paths.push(absolute);
    }
  }
  return paths;
}

function toPosix(path) {
  return sep === '/' ? path : path.split(sep).join('/');
}

function printViolations(violations) {
  if (violations.length === 0) {
    console.log('[quality] OpenSpec active-area and completed-proposal residue audit passed.');
    return;
  }
  console.error(`[quality] OpenSpec residue audit found ${violations.length} issue(s):`);
  for (const violation of violations) {
    console.error(`- ${violation.path}: ${violation.detail}`);
  }
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const violations = runRepositoryAudit(process.cwd());
  printViolations(violations);
  process.exitCode = violations.length === 0 ? 0 : 1;
}
