import * as vscode from 'vscode';
import { buildFountainScriptIndex } from '@neko/content';
import type { ProjectSearchItemKind, ProjectSearchResult } from '@neko/shared';
import {
  createCharacterEvidenceStrategy,
  parseCharacterEvidenceLocation,
  resolveCharacterEvidenceProjectPath,
  type CharacterEvidenceEntityReader,
  type CharacterEvidenceLoader,
  type CharacterEvidenceOccurrenceReader,
  type CharacterEvidencePathResolutionInput,
  type CharacterEvidenceProjectSearchReader,
  type CharacterEvidenceResolvedProjectPath,
  type CharacterEvidenceRuntimeLogger,
  type CharacterEvidenceStoryIndexReader,
  type CharacterEvidenceTextReader,
  type ParsedCharacterEvidenceLocation,
} from '@neko/entity';
import { createVSCodeEntityServices } from '@neko/entity/host-vscode';
import { PROJECT_SEARCH_QUERY_COMMAND } from '@neko/search/host-vscode';
import { getLogger } from '../base';

export type {
  CharacterEvidenceEntityReader,
  CharacterEvidenceOccurrenceReader,
  CharacterEvidencePathResolutionInput,
  CharacterEvidenceProjectSearchInput,
  CharacterEvidenceProjectSearchReader,
  CharacterEvidenceResolvedProjectPath,
  CharacterEvidenceStoryIndexReader,
  CharacterEvidenceTextReader,
  ParsedCharacterEvidenceLocation,
} from '@neko/entity';

export { parseCharacterEvidenceLocation, resolveCharacterEvidenceProjectPath };

export interface CharacterEvidenceLoaderOptions {
  readonly projectRoot: string;
  readonly entityReader?: CharacterEvidenceEntityReader;
  readonly occurrenceReader?: CharacterEvidenceOccurrenceReader;
  readonly projectSearchReader?: CharacterEvidenceProjectSearchReader;
  readonly storyIndexReader?: CharacterEvidenceStoryIndexReader;
  readonly textReader?: CharacterEvidenceTextReader;
  readonly maxWindowLines?: number;
  readonly maxLocators?: number;
  readonly supportedExtensions?: readonly string[];
  readonly logger?: CharacterEvidenceRuntimeLogger;
}

const logger = getLogger('CharacterEvidenceLoader');
const PROJECT_SEARCH_LOCATOR_KINDS: readonly ProjectSearchItemKind[] = [
  'story-scene',
  'story-section',
  'script-role',
];

export function createCharacterEvidenceLoader(
  options: CharacterEvidenceLoaderOptions,
): CharacterEvidenceLoader {
  return createCharacterEvidenceStrategy({
    projectRoot: options.projectRoot,
    entityReader: options.entityReader ?? createEntityCharacterEvidenceReader(options.projectRoot),
    ...(options.occurrenceReader ? { occurrenceReader: options.occurrenceReader } : {}),
    projectSearchReader: options.projectSearchReader ?? createVSCodeProjectSearchEvidenceReader(),
    storyIndexReader: options.storyIndexReader ?? createVSCodeStoryIndexReader(),
    textReader: options.textReader ?? createVSCodeCharacterEvidenceTextReader(),
    ...(options.maxWindowLines !== undefined ? { maxWindowLines: options.maxWindowLines } : {}),
    ...(options.maxLocators !== undefined ? { maxLocators: options.maxLocators } : {}),
    ...(options.supportedExtensions ? { supportedExtensions: options.supportedExtensions } : {}),
    logger: options.logger ?? logger,
  });
}

export function createDefaultCharacterEvidenceLoader(projectRoot: string): CharacterEvidenceLoader {
  return createCharacterEvidenceLoader({ projectRoot });
}

function createEntityCharacterEvidenceReader(projectRoot: string): CharacterEvidenceEntityReader {
  const services = createVSCodeEntityServices({ projectRoot, logger });
  return {
    async getEntity(entityRef) {
      const entity = await services.service.get(entityRef.entityId);
      return entity?.kind === entityRef.entityKind ? entity : undefined;
    },
  };
}

function createVSCodeProjectSearchEvidenceReader(): CharacterEvidenceProjectSearchReader {
  return {
    async search(input) {
      const result = await vscode.commands.executeCommand<ProjectSearchResult>(
        PROJECT_SEARCH_QUERY_COMMAND,
        {
          text: input.query,
          mode: 'agent-tool',
          projectRoot: input.projectRoot,
          kinds: PROJECT_SEARCH_LOCATOR_KINDS,
          partitions: ['story-symbols'],
          freshness: 'allow-stale',
          limit: input.limit,
        },
      );
      return (result?.items ?? []).filter((item) => item.projectRoot === input.projectRoot);
    },
  };
}

function createVSCodeStoryIndexReader(): CharacterEvidenceStoryIndexReader {
  return {
    async getScriptIndex(filePath) {
      const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
      return buildFountainScriptIndex({ uri: filePath, content: raw });
    },
  };
}

function createVSCodeCharacterEvidenceTextReader(): CharacterEvidenceTextReader {
  return {
    async readTextFile(filePath) {
      const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
      return new TextDecoder().decode(raw);
    },
  };
}
