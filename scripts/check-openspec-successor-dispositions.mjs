#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const successorChange = 'simplify-project-authoring-and-installed-libraries';
const successorMarker = `SUCCESSOR: ${successorChange}`;
const governedChanges = [
  'refine-character-management-authoring-and-version-graph',
  'refine-world-management-authoring-and-runtime',
  'separate-companion-and-narrative-character-conversations',
  'simplify-resource-entity-character-world-boundaries',
  'unify-domain-authoring-workspaces',
];

const retiredPromisePatterns = [
  { id: 'standalone-authoring-authority', pattern: /standalone-library/iu },
  { id: 'management-quick-generation', pattern: /quick[- ]generation|quick generate/iu },
  {
    id: 'standalone-domain-authoring',
    pattern:
      /standalone (?:Character|World)(?:Project)? (?:library|authoring|creation|Studio|Workspace)/iu,
  },
  {
    id: 'direct-domain-authoring-destinations',
    pattern: /direct Project, Character, and World|Projects, Conversations, Characters, and Worlds/iu,
  },
];

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

const requiredDispositionFiles = [
  'unify-domain-authoring-workspaces/proposal.md',
  'unify-domain-authoring-workspaces/design.md',
  'unify-domain-authoring-workspaces/tasks.md',
  'unify-domain-authoring-workspaces/specs/domain-authoring-workspace-management/spec.md',
  'unify-domain-authoring-workspaces/specs/home-experience-entry-modes/spec.md',
  'unify-domain-authoring-workspaces/specs/desktop-creative-workbench-layout/spec.md',
  'refine-character-management-authoring-and-version-graph/proposal.md',
  'refine-character-management-authoring-and-version-graph/design.md',
  'refine-character-management-authoring-and-version-graph/tasks.md',
  'refine-character-management-authoring-and-version-graph/specs/character-management-authoring-experience/spec.md',
  'refine-character-management-authoring-and-version-graph/specs/character-portable-package/spec.md',
  'refine-character-management-authoring-and-version-graph/specs/desktop-creative-workbench-layout/spec.md',
  'refine-world-management-authoring-and-runtime/proposal.md',
  'refine-world-management-authoring-and-runtime/design.md',
  'refine-world-management-authoring-and-runtime/tasks.md',
  'refine-world-management-authoring-and-runtime/specs/world-management-authoring-experience/spec.md',
  'refine-world-management-authoring-and-runtime/specs/world-creator-assistance/spec.md',
  'refine-world-management-authoring-and-runtime/specs/world-portable-package/spec.md',
  'refine-world-management-authoring-and-runtime/specs/desktop-creative-workbench-layout/spec.md',
  'separate-companion-and-narrative-character-conversations/proposal.md',
  'separate-companion-and-narrative-character-conversations/design.md',
  'separate-companion-and-narrative-character-conversations/tasks.md',
  'separate-companion-and-narrative-character-conversations/specs/character-conversation-modes/spec.md',
  'simplify-resource-entity-character-world-boundaries/proposal.md',
  'simplify-resource-entity-character-world-boundaries/design.md',
  'simplify-resource-entity-character-world-boundaries/tasks.md',
  'simplify-resource-entity-character-world-boundaries/specs/creative-resource-semantic-composition/spec.md',
];

export function auditSuccessorDispositions(input) {
  const violations = [];
  const documents = new Map(input.documents.map((document) => [document.path, document.content]));

  for (const requiredFile of input.requiredDispositionFiles) {
    const content = documents.get(requiredFile);
    if (content === undefined) {
      violations.push({
        kind: 'missing-required-disposition-file',
        path: requiredFile,
        detail: 'Required predecessor artifact is missing.',
      });
      continue;
    }
    if (!content.includes(input.successorMarker)) {
      violations.push({
        kind: 'missing-successor-marker',
        path: requiredFile,
        detail: `Expected '${input.successorMarker}'.`,
      });
    }
  }

  for (const document of input.documents) {
    if (document.change === input.successorChange || !document.normative) continue;
    const matched = input.retiredPromisePatterns
      .filter(({ pattern }) => pattern.test(document.content))
      .map(({ id }) => id);
    if (matched.length === 0 || document.content.includes(input.successorMarker)) continue;
    violations.push({
      kind: 'unclassified-retired-promise',
      path: document.path,
      detail: `Retired promise classes require a successor disposition: ${matched.join(', ')}.`,
    });
  }

  for (const document of input.documents) {
    if (!input.governedChanges.includes(document.change)) continue;
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

  for (const path of input.successorScopeFiles) {
    const content = documents.get(path);
    if (content === undefined) {
      violations.push({
        kind: 'missing-successor-scope-file',
        path,
        detail: 'Successor scope artifact is missing.',
      });
      continue;
    }
    for (const governedChange of input.governedChanges) {
      if (!content.includes(governedChange)) {
        violations.push({
          kind: 'incomplete-successor-scope',
          path,
          detail: `Successor scope does not name '${governedChange}'.`,
        });
      }
    }
  }

  return violations;
}

function runRepositoryAudit(repoRoot) {
  const changesRoot = resolve(repoRoot, 'openspec/changes');
  const documents = collectMarkdownDocuments(changesRoot);
  return auditSuccessorDispositions({
    documents,
    governedChanges,
    forbiddenActivePromisePatterns,
    requiredDispositionFiles,
    retiredPromisePatterns,
    successorChange,
    successorMarker,
    successorScopeFiles: [
      `${successorChange}/proposal.md`,
      `${successorChange}/design.md`,
      `${successorChange}/tasks.md`,
      `${successorChange}/replacement-inventory.md`,
    ],
  });
}

function collectActivePromiseBlocks(document) {
  const activeContent = document.content.split(/<!--\s*SUCCESSOR:/u, 1)[0] ?? document.content;
  if (/\/specs\/[^/]+\/spec\.md$/u.test(document.path)) {
    const sections = activeContent.split(/(?=^### Requirement:)/gmu).slice(1);
    return sections.map((content) => ({
      content,
      kind: 'requirement',
      label: content.match(/^### Requirement:\s*(.+)$/mu)?.[1]?.trim() ?? 'unnamed',
    }));
  }
  if (document.path.endsWith('/tasks.md')) {
    return activeContent
      .split(/\r?\n/u)
      .filter((line) => /^- \[ \] /u.test(line))
      .map((content) => ({ content, kind: 'task', label: content.slice(6).trim() }));
  }
  return [];
}

function collectMarkdownDocuments(changesRoot) {
  if (!existsSync(changesRoot)) return [];
  const documents = [];
  for (const changeEntry of readdirSync(changesRoot, { withFileTypes: true })) {
    if (!changeEntry.isDirectory()) continue;
    const change = changeEntry.name;
    const changeRoot = join(changesRoot, change);
    for (const absolutePath of walkMarkdown(changeRoot)) {
      const path = toPosix(relative(changesRoot, absolutePath));
      documents.push({
        change,
        path,
        content: readFileSync(absolutePath, 'utf8'),
        normative: isNormativeArtifact(path),
      });
    }
  }
  return documents.sort((left, right) => left.path.localeCompare(right.path));
}

function walkMarkdown(root) {
  const paths = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) {
      paths.push(...walkMarkdown(absolute));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      paths.push(absolute);
    }
  }
  return paths;
}

function isNormativeArtifact(path) {
  const relativePath = path.slice(path.indexOf('/') + 1);
  return (
    relativePath === 'proposal.md' ||
    relativePath === 'design.md' ||
    relativePath === 'tasks.md' ||
    /^specs\/[^/]+\/spec\.md$/u.test(relativePath)
  );
}

function toPosix(path) {
  return sep === '/' ? path : path.split(sep).join('/');
}

function printViolations(violations) {
  if (violations.length === 0) {
    console.log(
      `[quality] OpenSpec successor dispositions are complete for ${governedChanges.length} governed changes.`,
    );
    return;
  }
  console.error(`[quality] OpenSpec successor disposition audit found ${violations.length} issue(s):`);
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
