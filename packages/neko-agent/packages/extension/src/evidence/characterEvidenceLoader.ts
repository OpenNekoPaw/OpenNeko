import * as vscode from 'vscode';
import type {
  CreativeEntityRef,
  DashboardCreativeEntityDetail,
  DashboardCreativeEntityRef,
  DashboardCreativeEntitySource,
  NekoStoryAPI,
  ProjectSearchItemKind,
  ProjectSearchResult,
} from '@neko/shared';
import {
  DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND,
  DASHBOARD_NEUTRAL_CREATIVE_ENTITY_SOURCE_COMMAND,
  isDashboardCreativeEntityDetail,
  isDashboardCreativeEntitySource,
  type DashboardCreativeEntitySourceRequest,
} from '@neko/shared/types/dashboard-creative-entity';
import {
  createCharacterEvidenceStrategy,
  parseCharacterEvidenceLocation,
  resolveCharacterEvidenceProjectPath,
  type CharacterEvidenceDashboardDetailReader,
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
import { PROJECT_SEARCH_QUERY_COMMAND } from '@neko/search/host-vscode';
import { getLogger } from '../base';

export type {
  CharacterEvidenceDashboardDetailReader,
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
  readonly dashboardReader?: CharacterEvidenceDashboardDetailReader;
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
    dashboardReader:
      options.dashboardReader ?? createDashboardCharacterEvidenceDetailReader(options.projectRoot),
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

function createDashboardCharacterEvidenceDetailReader(
  projectRoot: string,
): CharacterEvidenceDashboardDetailReader {
  return {
    async listDetails(entityRef) {
      const sources = await loadDashboardCreativeEntitySources({ projectRoot });
      const details: DashboardCreativeEntityDetail[] = [];
      for (const source of orderDashboardSourcesForEntityRef(sources, entityRef)) {
        for (const ref of dashboardRefsForEntity(projectRoot, source.source, entityRef)) {
          try {
            const detail = await source.getDetail(ref);
            if (isDashboardCreativeEntityDetail(detail)) {
              details.push(detail);
              break;
            }
          } catch (error) {
            logger.debug('Character evidence Dashboard detail source failed', {
              source: source.source,
              entityId: entityRef.entityId,
              error: formatUnknownError(error),
            });
          }
        }
      }
      return details;
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
      const api = await getStoryApi();
      return api?.getScriptIndex(filePath);
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

async function loadDashboardCreativeEntitySources(
  request: DashboardCreativeEntitySourceRequest,
): Promise<readonly DashboardCreativeEntitySource[]> {
  const commands = [
    DASHBOARD_NEUTRAL_CREATIVE_ENTITY_SOURCE_COMMAND,
    DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND,
  ] as const;
  const sources: DashboardCreativeEntitySource[] = [];
  for (const command of commands) {
    try {
      const source = await vscode.commands.executeCommand<unknown>(command, request);
      if (isDashboardCreativeEntitySource(source)) {
        sources.push(source);
      }
    } catch (error) {
      logger.debug('Character evidence Dashboard source unavailable', {
        command,
        error: formatUnknownError(error),
      });
    }
  }
  return sources;
}

async function getStoryApi(): Promise<NekoStoryAPI | undefined> {
  try {
    const extension = vscode.extensions.getExtension<NekoStoryAPI>('neko.neko-story');
    if (!extension) return undefined;
    return extension.isActive ? extension.exports : await extension.activate();
  } catch {
    return undefined;
  }
}

function orderDashboardSourcesForEntityRef(
  sources: readonly DashboardCreativeEntitySource[],
  entityRef: CreativeEntityRef,
): readonly DashboardCreativeEntitySource[] {
  return [...sources].sort((left, right) => {
    const leftRank = dashboardSourceRank(left.source, entityRef);
    const rightRank = dashboardSourceRank(right.source, entityRef);
    return leftRank - rightRank || left.source.localeCompare(right.source);
  });
}

function dashboardSourceRank(source: string, entityRef: CreativeEntityRef): number {
  if (entityRef.source && entityRef.source === source) return 0;
  if (source === 'neko-story') return 1;
  if (source === 'neko-entity') return 2;
  return 3;
}

function dashboardRefsForEntity(
  projectRoot: string,
  source: string,
  entityRef: CreativeEntityRef,
): readonly DashboardCreativeEntityRef[] {
  const base = {
    source,
    entityId: entityRef.entityId,
    entityKind: entityRef.entityKind,
    projectRoot,
  } satisfies Omit<DashboardCreativeEntityRef, 'sourceEntityId'>;
  return [
    { ...base, sourceEntityId: `entity:${entityRef.entityId}` },
    { ...base, sourceEntityId: entityRef.entityId },
    { ...base, sourceEntityId: `candidate:${entityRef.entityKind}:${entityRef.entityId}` },
  ];
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
