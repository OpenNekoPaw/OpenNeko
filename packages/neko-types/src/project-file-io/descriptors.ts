import type { AudioProjectData } from '../types/audioProject';
import type { CanvasData } from '../types/canvas';
import type { NkmProjectData } from '../types/model-project';
import type { ProjectData } from '../types/project';
import type { NkpProjectData } from '../types/puppet';
import type { NksDocument } from '../types/sketch';
import type {
  TimelineElement,
  AudioElement,
  MediaElement,
  PuppetElement,
  Scene3DElement,
} from '../types/element';
import type {
  PortableSourcePathPolicy,
  ProjectSourceRole,
  ProjectSourceDescriptor,
  ProjectSourceReplacement,
} from './source-policy';

type SourceBearingTimelineElement = MediaElement | AudioElement | Scene3DElement | PuppetElement;

export const nkvSourcePathPolicy: PortableSourcePathPolicy<ProjectData> = {
  listSources: listTimelineProjectSources,
  replaceSources: replaceTimelineProjectSources,
};

export const nkaSourcePathPolicy: PortableSourcePathPolicy<AudioProjectData> = {
  listSources(document) {
    return listTimelineProjectSources({ tracks: document.tracks });
  },
  replaceSources(document, replacements) {
    return {
      ...document,
      tracks: replaceTimelineTracks(document.tracks, replacements),
    };
  },
};

export const nkcSourcePathPolicy: PortableSourcePathPolicy<CanvasData> = {
  listSources(document) {
    return listCanvasProjectSources(document);
  },
  replaceSources(document, replacements) {
    return replaceCanvasProjectSources(document, replacements);
  },
};

export const nksSourcePathPolicy: PortableSourcePathPolicy<NksDocument> = {
  listSources(document) {
    return listSketchLayerSources(document.layers);
  },
  replaceSources(document, replacements) {
    return {
      ...document,
      layers: replaceSketchLayerSources(document.layers, replacements),
    };
  },
};

function listSketchLayerSources(
  layers: readonly NksDocument['layers'][number][],
): ProjectSourceDescriptor[] {
  const descriptors: ProjectSourceDescriptor[] = [];
  layers.forEach((layer, index) => {
    if (layer.source?.path) {
      descriptors.push({
        id: `layers.${layer.id}.source`,
        role: mapSketchLayerSourceRole(layer.source.role),
        path: layer.source.path,
        fieldPath: ['layers', index, 'source', 'path'],
      });
    }
    descriptors.push(...listSketchLayerSources(layer.children));
  });
  return descriptors;
}

function replaceSketchLayerSources(
  layers: NksDocument['layers'],
  replacements: readonly ProjectSourceReplacement[],
): NksDocument['layers'] {
  return layers.map((layer) => {
    const replacement = layer.source?.path
      ? replacements.find((item) => item.descriptor.path === layer.source?.path)
      : undefined;
    return {
      ...layer,
      ...(replacement && layer.source
        ? {
            source: {
              ...layer.source,
              path: replacement.path,
            },
          }
        : {}),
      children: replaceSketchLayerSources(layer.children, replacements),
    };
  });
}

function mapSketchLayerSourceRole(
  role: NonNullable<NksDocument['layers'][number]['source']>['role'],
): ProjectSourceRole {
  if (role === 'psd') return 'document';
  if (role === 'generated-image') return 'generated';
  if (role === 'reference') return 'other';
  return 'image';
}

export const nkpSourcePathPolicy: PortableSourcePathPolicy<NkpProjectData> = {
  listSources(document) {
    const descriptors: ProjectSourceDescriptor[] = [];
    if (document.puppet.src) {
      descriptors.push({
        id: 'puppet.src',
        role: 'puppet',
        path: document.puppet.src,
        fieldPath: ['puppet', 'src'],
      });
    }
    if (document.puppet.importSource?.path) {
      descriptors.push({
        id: 'puppet.importSource.path',
        role: 'puppet',
        path: document.puppet.importSource.path,
        fieldPath: ['puppet', 'importSource', 'path'],
      });
    }
    if (document.puppet.bundle?.path) {
      descriptors.push({
        id: 'puppet.bundle.path',
        role: 'bundle',
        path: document.puppet.bundle.path,
        fieldPath: ['puppet', 'bundle', 'path'],
      });
    }
    pushBundleLocator(
      descriptors,
      'puppet.bundle.manifest',
      ['puppet', 'bundle', 'manifest'],
      document.puppet.bundle?.manifest,
    );
    pushBundleLocator(
      descriptors,
      'puppet.bundle.moc',
      ['puppet', 'bundle', 'moc'],
      document.puppet.bundle?.moc,
    );
    pushBundleLocator(
      descriptors,
      'bundleIndex.manifest',
      ['bundleIndex', 'manifest'],
      document.bundleIndex?.manifest,
    );
    pushBundleLocator(
      descriptors,
      'bundleIndex.moc',
      ['bundleIndex', 'moc'],
      document.bundleIndex?.moc,
    );
    document.bundleIndex?.textures.forEach((texture, index) => {
      pushBundleLocator(
        descriptors,
        `bundleIndex.textures.${index}.locator`,
        ['bundleIndex', 'textures', index, 'locator'],
        texture.locator,
      );
    });
    document.bundleIndex?.motions.forEach((motion, index) => {
      pushBundleLocator(
        descriptors,
        `bundleIndex.motions.${index}.locator`,
        ['bundleIndex', 'motions', index, 'locator'],
        motion.locator,
      );
    });
    document.bundleIndex?.expressions.forEach((expression, index) => {
      pushBundleLocator(
        descriptors,
        `bundleIndex.expressions.${index}.locator`,
        ['bundleIndex', 'expressions', index, 'locator'],
        expression.locator,
      );
    });
    pushBundleLocator(
      descriptors,
      'bundleIndex.physics',
      ['bundleIndex', 'physics'],
      document.bundleIndex?.physics,
    );
    return descriptors;
  },
  replaceSources(document, replacements) {
    let next: NkpProjectData = document;
    for (const replacement of replacements) {
      next = replaceNkpSource(next, replacement);
    }
    return next;
  },
};

export const nkmSourcePathPolicy: PortableSourcePathPolicy<NkmProjectData> = {
  listSources(document) {
    const descriptors: ProjectSourceDescriptor[] = [];
    if (document.model.src) {
      descriptors.push({
        id: 'model.src',
        role: 'model',
        path: document.model.src,
        fieldPath: ['model', 'src'],
      });
    }
    document.scene2d?.sprites?.forEach((sprite, index) => {
      descriptors.push({
        id: `scene2d.sprites.${index}.assetRef`,
        role: 'image',
        path: sprite.assetRef,
        fieldPath: ['scene2d', 'sprites', index, 'assetRef'],
      });
    });
    document.scene2d?.tilemaps?.forEach((tilemap, index) => {
      descriptors.push({
        id: `scene2d.tilemaps.${index}.tilesetRef`,
        role: 'image',
        path: tilemap.tilesetRef,
        fieldPath: ['scene2d', 'tilemaps', index, 'tilesetRef'],
      });
    });
    document.scene2d?.parallaxLayers?.forEach((layer, index) => {
      descriptors.push({
        id: `scene2d.parallaxLayers.${index}.assetRef`,
        role: 'image',
        path: layer.assetRef,
        fieldPath: ['scene2d', 'parallaxLayers', index, 'assetRef'],
      });
    });
    document.live?.actors?.forEach((actor, index) => {
      descriptors.push({
        id: `live.actors.${index}.ref`,
        role: 'puppet',
        path: actor.ref,
        fieldPath: ['live', 'actors', index, 'ref'],
      });
    });
    return descriptors;
  },
  replaceSources(document, replacements) {
    let next: NkmProjectData = document;
    for (const replacement of replacements) {
      next = replaceNkmSource(next, replacement);
    }
    return next;
  },
};

export function listTimelineProjectSources(
  document: Pick<ProjectData, 'tracks'>,
): readonly ProjectSourceDescriptor[] {
  return document.tracks.flatMap((track, trackIndex) =>
    track.elements.flatMap((element, elementIndex) => {
      if (!isSourceBearingTimelineElement(element) || !element.src) return [];
      return [
        {
          id: `${track.id}.${element.id}.src`,
          role: element.type,
          path: element.src,
          fieldPath: ['tracks', trackIndex, 'elements', elementIndex, 'src'],
          allowRemote: element.type === 'media' || element.type === 'audio',
        },
      ];
    }),
  );
}

export function replaceTimelineProjectSources(
  document: ProjectData,
  replacements: readonly ProjectSourceReplacement[],
): ProjectData {
  return {
    ...document,
    tracks: replaceTimelineTracks(document.tracks, replacements),
  };
}

function replaceTimelineTracks<TTrack extends Pick<ProjectData['tracks'][number], 'elements'>>(
  tracks: readonly TTrack[],
  replacements: readonly ProjectSourceReplacement[],
): TTrack[] {
  const replacementById = new Map(
    replacements.map((replacement) => [replacement.descriptor.id, replacement.path]),
  );
  return tracks.map((track) => ({
    ...track,
    elements: track.elements.map((element) => {
      if (!isSourceBearingTimelineElement(element)) return element;
      const keySuffix = `.${element.id}.src`;
      const replacement = [...replacementById.entries()].find(([id]) => id.endsWith(keySuffix));
      return replacement ? { ...element, src: replacement[1] } : element;
    }),
  }));
}

function isSourceBearingTimelineElement(
  element: TimelineElement,
): element is SourceBearingTimelineElement {
  return (
    element.type === 'media' ||
    element.type === 'audio' ||
    element.type === 'scene3d' ||
    element.type === 'puppet'
  );
}

function pushBundleLocator(
  descriptors: ProjectSourceDescriptor[],
  id: string,
  fieldPath: readonly (string | number)[],
  locator: { readonly bundlePath: string } | undefined,
): void {
  if (!locator?.bundlePath) return;
  descriptors.push({
    id,
    role: 'bundle',
    path: locator.bundlePath,
    fieldPath: [...fieldPath, 'bundlePath'],
  });
}

function replaceNkpSource(
  document: NkpProjectData,
  replacement: ProjectSourceReplacement,
): NkpProjectData {
  switch (replacement.descriptor.id) {
    case 'puppet.src':
      return { ...document, puppet: { ...document.puppet, src: replacement.path } };
    case 'puppet.importSource.path':
      return document.puppet.importSource
        ? {
            ...document,
            puppet: {
              ...document.puppet,
              importSource: { ...document.puppet.importSource, path: replacement.path },
            },
          }
        : document;
    case 'puppet.bundle.path':
      return document.puppet.bundle
        ? {
            ...document,
            puppet: {
              ...document.puppet,
              bundle: { ...document.puppet.bundle, path: replacement.path },
            },
          }
        : document;
    case 'puppet.bundle.manifest':
      return document.puppet.bundle
        ? {
            ...document,
            puppet: {
              ...document.puppet,
              bundle: {
                ...document.puppet.bundle,
                manifest: {
                  ...document.puppet.bundle.manifest,
                  bundlePath: replacement.path,
                  fragmentRef: `${replacement.path}#${document.puppet.bundle.manifest.entryPath}`,
                },
              },
            },
          }
        : document;
    case 'puppet.bundle.moc':
      return document.puppet.bundle
        ? {
            ...document,
            puppet: {
              ...document.puppet,
              bundle: {
                ...document.puppet.bundle,
                moc: {
                  ...document.puppet.bundle.moc,
                  bundlePath: replacement.path,
                  fragmentRef: `${replacement.path}#${document.puppet.bundle.moc.entryPath}`,
                },
              },
            },
          }
        : document;
    case 'bundleIndex.manifest':
      return document.bundleIndex
        ? {
            ...document,
            bundleIndex: {
              ...document.bundleIndex,
              manifest: {
                ...document.bundleIndex.manifest,
                bundlePath: replacement.path,
                fragmentRef: `${replacement.path}#${document.bundleIndex.manifest.entryPath}`,
              },
            },
          }
        : document;
    case 'bundleIndex.moc':
      return document.bundleIndex
        ? {
            ...document,
            bundleIndex: {
              ...document.bundleIndex,
              moc: {
                ...document.bundleIndex.moc,
                bundlePath: replacement.path,
                fragmentRef: `${replacement.path}#${document.bundleIndex.moc.entryPath}`,
              },
            },
          }
        : document;
    case 'bundleIndex.physics':
      return document.bundleIndex?.physics
        ? {
            ...document,
            bundleIndex: {
              ...document.bundleIndex,
              physics: {
                ...document.bundleIndex.physics,
                bundlePath: replacement.path,
                fragmentRef: `${replacement.path}#${document.bundleIndex.physics.entryPath}`,
              },
            },
          }
        : document;
    default:
      return replaceNkpIndexedBundleSource(document, replacement);
  }
}

function replaceNkpIndexedBundleSource(
  document: NkpProjectData,
  replacement: ProjectSourceReplacement,
): NkpProjectData {
  if (!document.bundleIndex) return document;
  const [collection, index] = parseIndexedBundleSourceId(replacement.descriptor.id);
  if (!collection || index === undefined) return document;

  switch (collection) {
    case 'textures':
      return {
        ...document,
        bundleIndex: {
          ...document.bundleIndex,
          textures: document.bundleIndex.textures.map((entry, entryIndex) =>
            entryIndex === index
              ? {
                  ...entry,
                  locator: {
                    ...entry.locator,
                    bundlePath: replacement.path,
                    fragmentRef: `${replacement.path}#${entry.locator.entryPath}`,
                  },
                }
              : entry,
          ),
        },
      };
    case 'motions':
      return {
        ...document,
        bundleIndex: {
          ...document.bundleIndex,
          motions: document.bundleIndex.motions.map((entry, entryIndex) =>
            entryIndex === index
              ? {
                  ...entry,
                  locator: {
                    ...entry.locator,
                    bundlePath: replacement.path,
                    fragmentRef: `${replacement.path}#${entry.locator.entryPath}`,
                  },
                }
              : entry,
          ),
        },
      };
    case 'expressions':
      return {
        ...document,
        bundleIndex: {
          ...document.bundleIndex,
          expressions: document.bundleIndex.expressions.map((entry, entryIndex) =>
            entryIndex === index
              ? {
                  ...entry,
                  locator: {
                    ...entry.locator,
                    bundlePath: replacement.path,
                    fragmentRef: `${replacement.path}#${entry.locator.entryPath}`,
                  },
                }
              : entry,
          ),
        },
      };
    default:
      return document;
  }
}

function parseIndexedBundleSourceId(
  id: string,
): readonly ['textures' | 'motions' | 'expressions' | undefined, number | undefined] {
  const match = id.match(/^bundleIndex\.(textures|motions|expressions)\.(\d+)\.locator$/);
  if (!match) return [undefined, undefined];
  return [match[1] as 'textures' | 'motions' | 'expressions', Number(match[2])];
}

function replaceNkmSource(
  document: NkmProjectData,
  replacement: ProjectSourceReplacement,
): NkmProjectData {
  switch (replacement.descriptor.id) {
    case 'model.src':
      return { ...document, model: { ...document.model, src: replacement.path } };
    default:
      return replaceNkmIndexedSource(document, replacement);
  }
}

function replaceNkmIndexedSource(
  document: NkmProjectData,
  replacement: ProjectSourceReplacement,
): NkmProjectData {
  const [section, index] = parseNkmIndexedSourceId(replacement.descriptor.id);
  if (!section || index === undefined) return document;

  switch (section) {
    case 'sprites':
      return {
        ...document,
        scene2d: document.scene2d
          ? {
              ...document.scene2d,
              sprites: replaceIndexedAssetRef(
                document.scene2d.sprites,
                index,
                'assetRef',
                replacement.path,
              ),
            }
          : document.scene2d,
      };
    case 'tilemaps':
      return {
        ...document,
        scene2d: document.scene2d
          ? {
              ...document.scene2d,
              tilemaps: replaceIndexedAssetRef(
                document.scene2d.tilemaps,
                index,
                'tilesetRef',
                replacement.path,
              ),
            }
          : document.scene2d,
      };
    case 'parallaxLayers':
      return {
        ...document,
        scene2d: document.scene2d
          ? {
              ...document.scene2d,
              parallaxLayers: replaceIndexedAssetRef(
                document.scene2d.parallaxLayers,
                index,
                'assetRef',
                replacement.path,
              ),
            }
          : document.scene2d,
      };
    case 'actors':
      return {
        ...document,
        live: document.live
          ? {
              ...document.live,
              actors: replaceIndexedAssetRef(document.live.actors, index, 'ref', replacement.path),
            }
          : document.live,
      };
    default:
      return document;
  }
}

function parseNkmIndexedSourceId(
  id: string,
): readonly ['sprites' | 'tilemaps' | 'parallaxLayers' | 'actors' | undefined, number | undefined] {
  const match = id.match(/^(?:scene2d\.)?(sprites|tilemaps|parallaxLayers|actors)\.(\d+)\./);
  if (!match) return [undefined, undefined];
  return [match[1] as 'sprites' | 'tilemaps' | 'parallaxLayers' | 'actors', Number(match[2])];
}

function replaceIndexedAssetRef<TEntry extends Record<TKey, string>, TKey extends keyof TEntry>(
  entries: readonly TEntry[] | undefined,
  index: number,
  key: TKey,
  value: string,
): readonly TEntry[] | undefined {
  if (!entries) return entries;
  return entries.map((entry, entryIndex) =>
    entryIndex === index ? { ...entry, [key]: value } : entry,
  );
}

const CANVAS_SOURCE_FIELD_KEYS = new Set([
  'assetPath',
  'assetUri',
  'docPath',
  'documentPath',
  'filePath',
  'imagePath',
  'imageUri',
  'linkedProject',
  'mediaPath',
  'modelPath',
  'path',
  'projectPath',
  'referenceImagePath',
  'sourcePath',
  'sourceUri',
  'src',
  'thumbnailPath',
  'uri',
]);

const CANVAS_RUNTIME_FIELD_KEYS = new Set([
  'assetBinding',
  'binding',
  'cachePath',
  'cacheUri',
  'documentResourceStatus',
  'projection',
  'sourceBinding',
  'runtimeAssetPath',
  'runtimeReferenceImagePath',
  'runtimeThumbnailPath',
  'thumbnailData',
]);

const RUNTIME_OR_INLINE_FIELD_KEYS = new Set([
  'base64',
  'cachePath',
  'cacheUri',
  'dataUrl',
  'fragmentRef',
  'html',
  'prompt',
  'text',
  'thumbnailData',
  'url',
  'webviewUri',
]);

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
      case 'script':
        pushCanvasSource(descriptors, {
          id: `canvas.nodes.${nodeIndex}.data.scriptPath`,
          role: 'document',
          path: readString(data['scriptPath']),
          fieldPath: [...dataPath, 'scriptPath'],
        });
        break;
      case 'document':
        pushCanvasSource(descriptors, {
          id: `canvas.nodes.${nodeIndex}.data.docPath`,
          role: 'document',
          path: readString(data['docPath']),
          fieldPath: [...dataPath, 'docPath'],
        });
        break;
      case 'model':
        pushCanvasSource(descriptors, {
          id: `canvas.nodes.${nodeIndex}.data.modelPath`,
          role: 'model',
          path: readString(data['modelPath']),
          fieldPath: [...dataPath, 'modelPath'],
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
      case 'project':
        pushCanvasSource(descriptors, {
          id: `canvas.nodes.${nodeIndex}.data.projectPath`,
          role: 'project',
          path: readString(data['projectPath']),
          fieldPath: [...dataPath, 'projectPath'],
        });
        break;
      case 'shot':
        pushCanvasSource(descriptors, {
          id: `canvas.nodes.${nodeIndex}.data.referenceImagePath`,
          role: 'image',
          path: readString(data['referenceImagePath']),
          fieldPath: [...dataPath, 'referenceImagePath'],
        });
        pushCanvasStoryboardMediaRefs(
          descriptors,
          readArray(data['sourceMediaRefs']),
          `canvas.nodes.${nodeIndex}.data.sourceMediaRefs`,
          [...dataPath, 'sourceMediaRefs'],
        );
        pushCanvasStoryboardMediaRefs(
          descriptors,
          readArray(data['generatedMediaRefs']),
          `canvas.nodes.${nodeIndex}.data.generatedMediaRefs`,
          [...dataPath, 'generatedMediaRefs'],
        );
        pushCanvasStoryboardMediaRefs(
          descriptors,
          readArray(data['mediaRefs']),
          `canvas.nodes.${nodeIndex}.data.mediaRefs`,
          [...dataPath, 'mediaRefs'],
        );
        pushCanvasShotImagePrepSources(
          descriptors,
          data['shotImagePrepPlan'],
          `canvas.nodes.${nodeIndex}.data.shotImagePrepPlan`,
          [...dataPath, 'shotImagePrepPlan'],
        );
        break;
      default:
        pushRegisteredCanvasDataSources(
          descriptors,
          data,
          `canvas.nodes.${nodeIndex}.data`,
          dataPath,
        );
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

function pushRegisteredCanvasDataSources(
  descriptors: ProjectSourceDescriptor[],
  value: unknown,
  id: string,
  fieldPath: readonly (string | number)[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      pushRegisteredCanvasDataSources(descriptors, item, `${id}.${index}`, [...fieldPath, index]),
    );
    return;
  }
  if (!isPlainRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    if (CANVAS_RUNTIME_FIELD_KEYS.has(key) || RUNTIME_OR_INLINE_FIELD_KEYS.has(key)) continue;
    const childPath = [...fieldPath, key];
    const childId = `${id}.${key}`;
    if (
      typeof child === 'string' &&
      CANVAS_SOURCE_FIELD_KEYS.has(key) &&
      !isObjectPathBindingPointer(value, key, child) &&
      isSourceLikeValue(child)
    ) {
      descriptors.push({
        id: childId,
        role: inferSourceRole(key, child),
        path: child,
        fieldPath: childPath,
        allowRemote: key.toLowerCase().includes('uri') || key.toLowerCase().includes('url'),
      });
      continue;
    }
    pushRegisteredCanvasDataSources(descriptors, child, childId, childPath);
  }
}

function pushCanvasStoryboardMediaRefs(
  descriptors: ProjectSourceDescriptor[],
  refs: readonly unknown[] | undefined,
  id: string,
  fieldPath: readonly (string | number)[],
): void {
  refs?.forEach((ref, refIndex) => {
    if (!isPlainRecord(ref)) return;
    const locator = ref['locator'];
    if (!isPlainRecord(locator) || locator['type'] !== 'workspace-path') return;
    pushCanvasSource(descriptors, {
      id: `${id}.${refIndex}.locator.path`,
      role: inferSourceRole('path', readString(locator['path']) ?? ''),
      path: readString(locator['path']),
      fieldPath: [...fieldPath, refIndex, 'locator', 'path'],
    });
  });
}

function pushCanvasShotImagePrepSources(
  descriptors: ProjectSourceDescriptor[],
  value: unknown,
  id: string,
  fieldPath: readonly (string | number)[],
): void {
  if (!isPlainRecord(value)) return;
  pushCanvasStoryboardMediaRefs(
    descriptors,
    readArray(value['sourceMediaRefs']),
    `${id}.sourceMediaRefs`,
    [...fieldPath, 'sourceMediaRefs'],
  );
  pushCanvasStoryboardMediaRefs(
    descriptors,
    readArray(value['generatedMediaRefs']),
    `${id}.generatedMediaRefs`,
    [...fieldPath, 'generatedMediaRefs'],
  );
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

function isObjectPathBindingPointer(
  parent: Record<string, unknown>,
  key: string,
  value: string,
): boolean {
  return key === 'path' && isJsonPointerPath(value) && isFieldBindingRecord(parent);
}

function isFieldBindingRecord(value: Record<string, unknown>): boolean {
  if (!Object.prototype.hasOwnProperty.call(value, 'path')) return false;
  return (
    Object.prototype.hasOwnProperty.call(value, 'valueType') ||
    Object.prototype.hasOwnProperty.call(value, 'mode') ||
    Object.prototype.hasOwnProperty.call(value, 'required') ||
    Object.prototype.hasOwnProperty.call(value, 'defaultValue') ||
    Object.prototype.hasOwnProperty.call(value, 'label')
  );
}

function isJsonPointerPath(value: string): boolean {
  return value === '' || value.startsWith('/');
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
    /^blob:/i.test(trimmed) ||
    /^vscode-(?:webview-)?resource:/i.test(trimmed) ||
    /^webview:/i.test(trimmed) ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('${') ||
    /^[A-Za-z]:[\\/]/.test(trimmed) ||
    /^https?:\/\//i.test(trimmed) ||
    /\.[A-Za-z0-9]{2,8}(?:[?#].*)?$/.test(trimmed)
  );
}

function inferSourceRole(key: string, value: string): ProjectSourceDescriptor['role'] {
  const lower = `${key} ${value}`.toLowerCase();
  if (lower.includes('audio') || /\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(value)) return 'audio';
  if (lower.includes('model') || /\.(glb|gltf|vrm|fbx|obj)$/i.test(value)) return 'model';
  if (lower.includes('project') || /\.(nkv|nkc|nks|nkp|nkm|nka)$/i.test(value)) return 'project';
  if (lower.includes('document') || lower.includes('docpath')) return 'document';
  if (/\.(png|jpe?g|webp|gif|bmp|svg|hdr|exr)$/i.test(value)) return 'image';
  return 'media';
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
