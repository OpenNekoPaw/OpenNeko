/**
 * Explicit-document executor for deterministic Cut timeline transforms.
 */

import * as vscode from 'vscode';
import { createDefaultProject, type ProjectData } from '@neko/shared';
import { getService } from '../base';
import { IEditorRegistry } from '../editor/common/editorRegistry';
import type { VideoEditorModel } from '../editor/video/videoEditorModel';
import { createNkvProjectRef } from './CutProjectQualityFacade';
import { ProjectSessionService } from './ProjectSessionService';
import { createToolRegistry, type IToolHandler } from './tools';
import { normalizePathsForSave } from './tools/helpers';

interface ToolResult {
  success: boolean;
  error?: string;
  data?: unknown;
  duration?: number;
}

export interface TimelineToolExecutionTarget {
  readonly documentUri: string;
  readonly expectedProjectRevision?: string;
}

const READ_ONLY_TOOL_NAMES = new Set([
  'GetTimelineInfo',
  'GetElementInfo',
  'ListElements',
  'ListEffects',
  'ListTransitions',
  'GetKeyframes',
]);

export class TimelineToolExecutor {
  private pending: Promise<void> = Promise.resolve();
  private readonly registry: Map<string, IToolHandler>;

  constructor() {
    this.registry = createToolRegistry();
  }

  async execute(
    toolName: string,
    params: Record<string, unknown>,
    target: TimelineToolExecutionTarget,
  ): Promise<ToolResult> {
    const start = Date.now();
    const run = async (): Promise<ToolResult> => {
      const targetUri = parseCutDocumentUri(target?.documentUri);
      if (!targetUri) {
        return failed('Cut timeline operations require an explicit file .nkv documentUri.', start);
      }

      const handler = this.registry.get(toolName);
      if (!handler) return failed(`Unknown tool: ${toolName}`, start);
      if (!READ_ONLY_TOOL_NAMES.has(toolName) && !target.expectedProjectRevision) {
        return failed(
          'missing-project-revision: durable Cut timeline mutation requires expectedProjectRevision.',
          start,
        );
      }

      const editor = getService(IEditorRegistry)?.getEditorByUri(targetUri);
      const model = editor?.type === 'video' ? (editor as unknown as VideoEditorModel) : undefined;
      const session = model ? undefined : new ProjectSessionService();

      try {
        if (session) await session.load(targetUri.fsPath);
        const project = model?.getProjectData() ?? session?.getProjectData() ?? null;
        if (!project) return failed(`Cut project is unavailable: ${target.documentUri}`, start);

        const actualRevision = createNkvProjectRef(target.documentUri, project).projectRevision;
        if (target.expectedProjectRevision && target.expectedProjectRevision !== actualRevision) {
          return failed(
            `stale-project-revision: expected ${target.expectedProjectRevision}, received ${actualRevision}.`,
            start,
          );
        }

        const result = handler.apply(project, toolName, params);
        if (!result.success) return failed(result.error ?? `Cut ${toolName} failed.`, start);

        if (result.updatedProject) {
          if (model) {
            await model.syncSavedProjectData(
              await normalizePathsForSave(result.updatedProject, targetUri.fsPath),
            );
          } else {
            await session!.updateProjectData(
              await normalizePathsForSave(result.updatedProject, targetUri.fsPath),
            );
          }
        }

        const data =
          toolName === 'GetTimelineInfo' && typeof result.data === 'object' && result.data !== null
            ? {
                ...result.data,
                documentUri: target.documentUri,
                projectRevision: actualRevision,
              }
            : result.data;
        return { success: true, data, duration: Date.now() - start };
      } catch (error) {
        return failed(error instanceof Error ? error.message : String(error), start);
      } finally {
        session?.dispose();
      }
    };

    const task = this.pending.then(run, run) as Promise<ToolResult>;
    this.pending = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }
}

function parseCutDocumentUri(documentUri: string | undefined): vscode.Uri | undefined {
  if (!documentUri) return undefined;
  try {
    const uri = vscode.Uri.parse(documentUri, true);
    return uri.scheme === 'file' && uri.fsPath.toLowerCase().endsWith('.nkv') ? uri : undefined;
  } catch {
    return undefined;
  }
}

function failed(error: string, start: number): ToolResult {
  return { success: false, error, duration: Date.now() - start };
}

export function createEmptyProject(): ProjectData {
  return createDefaultProject();
}
