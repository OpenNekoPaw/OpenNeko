import type { CanvasData } from '../types/canvas';
import { isHostProjectedRuntimeValue } from '@neko/content-domain';
import type {
  PortableSourcePathPolicy,
  ProjectSourceDescriptor,
  ProjectSourceReplacement,
} from '@neko/content-domain/project-file-io';

export const nkcSourcePathPolicy: PortableSourcePathPolicy<CanvasData> = {
  listSources(document) {
    return listCanvasProjectSources(document);
  },
  replaceSources(document, replacements) {
    return replaceCanvasProjectSources(document, replacements);
  },
};

function listCanvasProjectSources(document: CanvasData): readonly ProjectSourceDescriptor[] {
  const descriptors: ProjectSourceDescriptor[] = [];

  pushCanvasSource(descriptors, {
    id: 'canvas.linkedProject',
    role: 'project',
    path: document.linkedProject,
    fieldPath: ['linkedProject'],
  });

  document.nodes?.forEach((node, nodeIndex) => {
    const nodePath = ['nodes', nodeIndex] as const;
    const dataPath = [...nodePath, 'data'] as const;
    const data = readCanvasNodeData(node);
    if (!data) return;

    switch (node.type) {
      case 'media':
        pushCanvasSource(descriptors, {
          id: `canvas.nodes.${nodeIndex}.data.assetPath`,
          role: readCanvasMediaSourceRole(data),
          path: readString(data['assetPath']),
          fieldPath: [...dataPath, 'assetPath'],
          allowRemote: true,
        });
        pushCanvasSource(descriptors, {
          id: `canvas.nodes.${nodeIndex}.data.thumbnailPath`,
          role: 'image',
          path: readString(data['thumbnailPath']),
          fieldPath: [...dataPath, 'thumbnailPath'],
        });
        break;
      case 'file':
        pushCanvasSource(descriptors, {
          id: `canvas.nodes.${nodeIndex}.data.path`,
          role: 'document',
          path: readString(data['path']),
          fieldPath: [...dataPath, 'path'],
        });
        break;
      case 'canvas-embed':
        pushCanvasSource(descriptors, {
          id: `canvas.nodes.${nodeIndex}.data.canvasPath`,
          role: 'project',
          path: readString(data['canvasPath']),
          fieldPath: [...dataPath, 'canvasPath'],
        });
        break;
      case 'job':
        pushCanvasJobFileRefs(
          descriptors,
          readArray(data['inputRefs']),
          `canvas.nodes.${nodeIndex}.data.inputRefs`,
          [...dataPath, 'inputRefs'],
        );
        pushCanvasJobFileRefs(
          descriptors,
          readArray(data['outputRefs']),
          `canvas.nodes.${nodeIndex}.data.outputRefs`,
          [...dataPath, 'outputRefs'],
        );
        break;
      default:
        break;
    }
  });

  document.relatedBoards?.forEach((board, boardIndex) => {
    const ref = board.ref;
    if (ref.kind === 'workspace-path') {
      pushCanvasSource(descriptors, {
        id: `canvas.relatedBoards.${boardIndex}.ref.path`,
        role: 'project',
        path: ref.path,
        fieldPath: ['relatedBoards', boardIndex, 'ref', 'path'],
      });
    } else if (ref.kind === 'uri') {
      pushCanvasSource(descriptors, {
        id: `canvas.relatedBoards.${boardIndex}.ref.uri`,
        role: 'project',
        path: ref.uri,
        fieldPath: ['relatedBoards', boardIndex, 'ref', 'uri'],
        allowRemote: true,
      });
    }
  });

  return descriptors;
}

function replaceCanvasProjectSources(
  document: CanvasData,
  replacements: readonly ProjectSourceReplacement[],
): CanvasData {
  return replaceObjectPathSources(document, replacements);
}

function readCanvasNodeData(
  node: CanvasData['nodes'][number],
): Record<string, unknown> | undefined {
  const data = (node as { readonly data?: unknown }).data;
  return isPlainRecord(data) ? data : undefined;
}

function pushCanvasSource(
  descriptors: ProjectSourceDescriptor[],
  descriptor: Omit<ProjectSourceDescriptor, 'path'> & { readonly path?: string },
): void {
  if (!descriptor.path || !isSourceLikeValue(descriptor.path)) return;
  descriptors.push({ ...descriptor, path: descriptor.path });
}

function pushCanvasJobFileRefs(
  descriptors: ProjectSourceDescriptor[],
  refs: readonly unknown[] | undefined,
  id: string,
  fieldPath: readonly (string | number)[],
): void {
  refs?.forEach((ref, refIndex) => {
    if (!isPlainRecord(ref) || ref['kind'] !== 'file') return;
    pushCanvasSource(descriptors, {
      id: `${id}.${refIndex}.path`,
      role: 'document',
      path: readString(ref['path']),
      fieldPath: [...fieldPath, refIndex, 'path'],
    });
  });
}

function readCanvasMediaSourceRole(data: Record<string, unknown>): ProjectSourceDescriptor['role'] {
  const mediaType = data['mediaType'];
  if (mediaType === 'audio') return 'audio';
  if (mediaType === 'image') return 'image';
  return 'media';
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readArray(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function replaceObjectPathSources<TDocument>(
  document: TDocument,
  replacements: readonly ProjectSourceReplacement[],
): TDocument {
  let next: unknown = document;
  for (const replacement of replacements) {
    next = replaceAtFieldPath(next, replacement.descriptor.fieldPath, replacement.path);
  }
  return next as TDocument;
}

function replaceAtFieldPath(
  value: unknown,
  fieldPath: readonly (string | number)[],
  replacement: string,
): unknown {
  if (fieldPath.length === 0) return replacement;
  const [head, ...rest] = fieldPath;
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      index === head ? replaceAtFieldPath(item, rest, replacement) : item,
    );
  }
  if (!isPlainRecord(value) || typeof head !== 'string') return value;
  return {
    ...value,
    [head]: replaceAtFieldPath(value[head], rest, replacement),
  };
}

function isSourceLikeValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 4096) return false;
  if (trimmed.startsWith('data:')) return false;
  return (
    isHostProjectedRuntimeValue(trimmed) ||
    /^webview:/i.test(trimmed) ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('${') ||
    /^[A-Za-z]:[\\/]/.test(trimmed) ||
    /^https?:\/\//i.test(trimmed) ||
    /\.[A-Za-z0-9]{2,16}(?:[?#].*)?$/.test(trimmed)
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
