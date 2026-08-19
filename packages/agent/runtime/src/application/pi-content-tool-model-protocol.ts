import type { SessionTreeEntry } from '@earendil-works/pi-agent-core';
import {
  isAgentAuthorizedContentReferenceContextData,
  TOOL_NAMES_PERCEPTION,
  TOOL_NAMES_SEARCH,
  TOOL_NAMES_SYSTEM,
  type AgentContextPayload,
  type MessageContextReference,
  type Tool,
  type ToolParameters,
  type ToolResult,
} from '@neko/agent-contracts';
import {
  isContentRepresentationLocator,
  isDocumentFormat,
  parseDocumentLocator,
  validateContentLocator,
  type ContentLocator,
  type ContentRepresentationLocator,
  type DocumentBatchCursor,
  type DocumentLocator,
} from '@neko/content';

import type { PiToolModelDefinitionProjection, PiToolModelProtocol } from '../pi/openneko-tool';
import {
  isPiUserMessagePresentationEntry,
  parsePiUserMessagePresentation,
} from '../pi/user-message-presentation';
import { createAgentInputReferenceId } from '../input/content-reference-id';
import { classifyAgentContentPath } from '../input/content-path-classification';

const MAX_MODEL_DOCUMENT_CHARS = 24_000;
const MAX_MODEL_DOCUMENT_UNITS = 100;
const MAX_MODEL_SEARCH_ITEMS = 20;
const MAX_MODEL_TOOL_RESULT_CHARS = 24_000;
const MAX_MODEL_IMAGE_REFS = 5;
const MAX_MODEL_IMAGE_FOCUS_CHARS = 4_000;
const LIST_DIRECTORY_TOOL_NAME = 'ListDirectory';

const LIST_DIRECTORY_PARAMETERS: ToolParameters = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'Workspace-relative directory path. Use "." for the Workspace root.',
    },
    cursor_ref: {
      type: 'string',
      description: 'Continuation reference returned by an earlier ListDirectory result.',
    },
  },
  anyOf: [{ required: ['path'] }, { required: ['cursor_ref'] }],
  additionalProperties: false,
};

const READ_DOCUMENT_PARAMETERS: ToolParameters = {
  type: 'object',
  properties: {
    input_ref: {
      type: 'string',
      description: 'Input reference shown with the attached document.',
    },
    mode: {
      type: 'string',
      enum: ['content', 'manifest', 'range', 'next'],
      description: 'Use content, manifest, range, or next.',
    },
    unit_ref: {
      type: 'string',
      description: 'Document unit reference returned by an earlier manifest result.',
    },
    end_unit_ref: {
      type: 'string',
      description: 'Optional ending unit reference returned by the same manifest result.',
    },
    cursor_ref: {
      type: 'string',
      description: 'Cursor reference returned by an earlier result.',
    },
    max_chars: {
      type: 'integer',
      minimum: 1_000,
      maximum: MAX_MODEL_DOCUMENT_CHARS,
      description: `Maximum returned text characters; at most ${MAX_MODEL_DOCUMENT_CHARS}.`,
    },
    include_images: {
      type: 'boolean',
      description: 'Return bounded image references when available.',
    },
  },
  additionalProperties: false,
};

const READ_IMAGE_PARAMETERS: ToolParameters = {
  type: 'object',
  properties: {
    image_refs: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: MAX_MODEL_IMAGE_REFS,
      description: `Image references shown with authorized inputs or returned by prior Tools; maximum ${MAX_MODEL_IMAGE_REFS}.`,
    },
    analysis: {
      type: 'string',
      enum: ['describe', 'ocr', 'panels', 'storyboard', 'custom'],
      description: 'Visual analysis intent for the provider continuation.',
    },
    prompt: {
      type: 'string',
      description: 'Optional concise visual focus.',
    },
  },
  required: ['image_refs'],
  additionalProperties: false,
};

const UNDERSTAND_IMAGE_PARAMETERS: ToolParameters = {
  type: 'object',
  properties: {
    image_refs: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: MAX_MODEL_IMAGE_REFS,
      description: `Authorized image or input references shown in this Conversation; maximum ${MAX_MODEL_IMAGE_REFS}.`,
    },
    focus: {
      type: 'string',
      maxLength: MAX_MODEL_IMAGE_FOCUS_CHARS,
      description: 'Optional concise description of what visual evidence to inspect.',
    },
  },
  required: ['image_refs'],
  additionalProperties: false,
};

type Binding =
  | {
      readonly kind: 'input';
      readonly locator: ContentLocator;
      readonly label: string;
      readonly mediaType?: string;
    }
  | {
      readonly kind: 'unit';
      readonly source: ContentLocator;
      readonly locator: DocumentLocator;
    }
  | {
      readonly kind: 'cursor';
      readonly source: ContentLocator;
      readonly cursor: DocumentBatchCursor;
    }
  | {
      readonly kind: 'image';
      readonly image: BoundImage;
    }
  | {
      readonly kind: 'directory-cursor';
      readonly directoryPath: string;
      readonly after: string;
    };

interface BoundImage {
  readonly alias?: string;
  readonly entryPath?: string;
  readonly width?: number;
  readonly height?: number;
  readonly mimeType?: string;
  readonly contentLocator?: ContentLocator;
  readonly representationLocator?: ContentRepresentationLocator;
}

interface ConversationBindings {
  readonly refs: Map<string, Binding>;
}

interface IssuedContentReference {
  readonly ref: string;
  readonly field: 'input_ref' | 'image_ref';
  readonly label: string;
  readonly mediaType?: string;
}

export class PiContentToolModelProtocol implements PiToolModelProtocol {
  private readonly conversations = new Map<string, ConversationBindings>();

  projectDefinition(tool: Tool): PiToolModelDefinitionProjection | undefined {
    if (tool.name === TOOL_NAMES_SYSTEM.READ_DOCUMENT) {
      return {
        description:
          'Read an attached structured document by short references. Use input_ref from the message, then unit_ref, cursor_ref, and image_ref values returned by this Tool. Never construct locators or paths.',
        parameters: READ_DOCUMENT_PARAMETERS,
      };
    }
    if (tool.name === TOOL_NAMES_SYSTEM.READ_IMAGE) {
      return {
        description:
          'Expose up to five authorized images to a native vision continuation using image_ref values shown with inputs or returned by prior Tools. Never pass locators, paths, MIME metadata, or document positions.',
        parameters: READ_IMAGE_PARAMETERS,
      };
    }
    if (tool.name === TOOL_NAMES_PERCEPTION.IMAGE_UNDERSTAND) {
      return {
        description:
          'Analyze up to five authorized images with the configured external image understanding model. Use only image_ref or image input_ref values shown in this Conversation; never pass paths, locators, providers, or model ids.',
        parameters: UNDERSTAND_IMAGE_PARAMETERS,
      };
    }
    if (tool.name === LIST_DIRECTORY_TOOL_NAME) {
      return {
        description:
          'List one level of an authorized Workspace directory. Use workspace_path only with Read, input_ref with the exact content capability, image_ref with ReadImage, and directory_path with ListDirectory.',
        parameters: LIST_DIRECTORY_PARAMETERS,
      };
    }
    return undefined;
  }

  bindInputs(
    conversationId: string,
    payloads: readonly AgentContextPayload[] | undefined,
  ): ReadonlyMap<string, string> {
    const projected = new Map<string, string>();
    for (const payload of payloads ?? []) {
      if (!isAgentAuthorizedContentReferenceContextData(payload.data)) continue;
      const ref = createAgentInputReferenceId(payload.id, payload.data.locator);
      this.bind(conversationId, ref, {
        kind: 'input',
        locator: payload.data.locator,
        label: payload.label,
        ...(payload.data.mediaType === undefined ? {} : { mediaType: payload.data.mediaType }),
      });
      projected.set(payload.id, ref);
    }
    return projected;
  }

  restoreConversation(conversationId: string, entries: readonly SessionTreeEntry[]): void {
    this.conversations.delete(conversationId);
    for (const entry of entries) {
      if (isPiUserMessagePresentationEntry(entry)) {
        const presentation = parsePiUserMessagePresentation(entry.data);
        for (const reference of presentation.contextReferences ?? []) {
          this.restoreInputReference(conversationId, reference);
        }
        continue;
      }
      if (entry.type !== 'message' || entry.message.role !== 'toolResult') continue;
      const details = asRecord(entry.message.details);
      const result = details && typeof details['success'] === 'boolean' ? details : undefined;
      if (result?.['success'] !== true) continue;
      if (entry.message.toolName === TOOL_NAMES_SYSTEM.READ_DOCUMENT) {
        this.projectDocumentResult(conversationId, result as unknown as ToolResult);
      } else if (entry.message.toolName === TOOL_NAMES_SYSTEM.READ_IMAGE) {
        this.projectImageResult(conversationId, result as unknown as ToolResult);
      } else if (entry.message.toolName === TOOL_NAMES_SEARCH.QUERY_PROJECT_SEARCH) {
        this.projectSearchResult(conversationId, result as unknown as ToolResult);
      } else if (entry.message.toolName === LIST_DIRECTORY_TOOL_NAME) {
        this.projectDirectoryResult(conversationId, result as unknown as ToolResult);
      } else {
        this.projectPortableToolResult(conversationId, result as unknown as ToolResult);
      }
    }
  }

  releaseConversation(conversationId: string): void {
    this.conversations.delete(conversationId);
  }

  clear(): void {
    this.conversations.clear();
  }

  prepareArguments(
    input: Parameters<PiToolModelProtocol['prepareArguments']>[0],
  ): Record<string, unknown> {
    if (input.tool.name === TOOL_NAMES_SYSTEM.READ_DOCUMENT) {
      return this.prepareReadDocument(input.context.identity.conversationId, input.args);
    }
    if (input.tool.name === TOOL_NAMES_SYSTEM.READ_IMAGE) {
      return this.prepareReadImage(input.context.identity.conversationId, input.args);
    }
    if (input.tool.name === TOOL_NAMES_PERCEPTION.IMAGE_UNDERSTAND) {
      return this.prepareUnderstandImage(input.context.identity.conversationId, input.args);
    }
    if (input.tool.name === LIST_DIRECTORY_TOOL_NAME) {
      return this.prepareListDirectory(input.context.identity.conversationId, input.args);
    }
    return input.args;
  }

  projectResultText(
    input: Parameters<PiToolModelProtocol['projectResultText']>[0],
  ): string | undefined {
    if (input.tool.name === TOOL_NAMES_SYSTEM.READ_DOCUMENT) {
      return JSON.stringify(
        this.projectDocumentResult(input.context.identity.conversationId, input.result),
      );
    }
    if (input.tool.name === TOOL_NAMES_SYSTEM.READ_IMAGE) {
      return JSON.stringify(
        this.projectImageResult(input.context.identity.conversationId, input.result),
      );
    }
    if (input.tool.name === TOOL_NAMES_SEARCH.QUERY_PROJECT_SEARCH) {
      return JSON.stringify(
        this.projectSearchResult(input.context.identity.conversationId, input.result),
      );
    }
    if (input.tool.name === LIST_DIRECTORY_TOOL_NAME) {
      return JSON.stringify(
        this.projectDirectoryResult(input.context.identity.conversationId, input.result),
      );
    }
    const projected = this.projectPortableToolResult(
      input.context.identity.conversationId,
      input.result,
    );
    if (projected === undefined) return undefined;
    const text = JSON.stringify(projected.value);
    if (text.length <= MAX_MODEL_TOOL_RESULT_CHARS) return text;
    return JSON.stringify({
      summary: 'Tool completed successfully; the full structured result remains in Tool details.',
      content_refs: projected.references.map(projectContentReference),
      result_truncated: true,
    });
  }

  private prepareReadDocument(
    conversationId: string,
    args: Record<string, unknown>,
  ): Record<string, unknown> {
    requireAllowedKeys(
      args,
      [
        'input_ref',
        'mode',
        'unit_ref',
        'end_unit_ref',
        'cursor_ref',
        'max_chars',
        'include_images',
      ],
      'ReadDocument',
    );
    const mode = readMode(args['mode']);
    const maxChars = readBoundedInteger(args['max_chars'], 20_000, 1_000, MAX_MODEL_DOCUMENT_CHARS);
    const includeImages = args['include_images'] === undefined || args['include_images'] === true;
    if (mode === 'next') {
      const cursorRef = requireRef(args['cursor_ref'], 'ReadDocument cursor_ref');
      const cursor = this.requireBinding(conversationId, cursorRef, 'cursor');
      return {
        source: cursor.source,
        mode,
        cursor: cursor.cursor,
        max_chars: maxChars,
        max_images: MAX_MODEL_IMAGE_REFS,
        include_images: includeImages,
      };
    }
    const sourceRef = requireRef(args['input_ref'], 'ReadDocument input_ref');
    const source = this.requireBinding(conversationId, sourceRef, 'input');
    if (source.mediaType !== 'document') {
      throw new Error(`ReadDocument input_ref '${sourceRef}' is not a structured document.`);
    }
    if (mode === 'range') {
      const unitRef = requireRef(args['unit_ref'], 'ReadDocument unit_ref');
      const unit = this.requireBinding(conversationId, unitRef, 'unit');
      assertSameSource(source.locator, unit.source, unitRef);
      const endUnitRef = optionalRef(args['end_unit_ref'], 'ReadDocument end_unit_ref');
      const endUnit =
        endUnitRef === undefined
          ? undefined
          : this.requireBinding(conversationId, endUnitRef, 'unit');
      if (endUnit) assertSameSource(source.locator, endUnit.source, endUnitRef!);
      return {
        source: source.locator,
        mode,
        range: {
          locator: unit.locator,
          ...(endUnit === undefined ? {} : { endLocator: endUnit.locator }),
          limit: { maxChars, maxImages: MAX_MODEL_IMAGE_REFS },
        },
        max_chars: maxChars,
        max_images: MAX_MODEL_IMAGE_REFS,
        include_images: includeImages,
      };
    }
    return {
      source: source.locator,
      mode,
      start_batch: mode === 'manifest',
      include_manifest: mode === 'manifest',
      include_images: includeImages,
      max_chars: maxChars,
      max_images: MAX_MODEL_IMAGE_REFS,
    };
  }

  private prepareReadImage(
    conversationId: string,
    args: Record<string, unknown>,
  ): Record<string, unknown> {
    requireAllowedKeys(args, ['image_refs', 'analysis', 'prompt'], 'ReadImage');
    const images = this.resolveImageReferences(conversationId, args['image_refs'], 'ReadImage');
    return {
      images,
      mode: 'metadata',
      max_images: images.length,
      ...(args['analysis'] === undefined ? {} : { analysis: args['analysis'] }),
      ...(args['prompt'] === undefined ? {} : { prompt: args['prompt'] }),
    };
  }

  private prepareUnderstandImage(
    conversationId: string,
    args: Record<string, unknown>,
  ): Record<string, unknown> {
    requireAllowedKeys(args, ['image_refs', 'focus'], 'Image understanding');
    const images = this.resolveImageReferences(
      conversationId,
      args['image_refs'],
      'Image understanding',
    );
    const focus = optionalBoundedText(
      args['focus'],
      'Image understanding focus',
      MAX_MODEL_IMAGE_FOCUS_CHARS,
    );
    return {
      images,
      ...(focus === undefined ? {} : { focus }),
    };
  }

  private resolveImageReferences(
    conversationId: string,
    value: unknown,
    label: string,
  ): BoundImage[] {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error(`${label} image_refs must contain at least one image reference.`);
    }
    if (value.length > MAX_MODEL_IMAGE_REFS) {
      throw new Error(
        `${label} accepts at most ${MAX_MODEL_IMAGE_REFS} image references per call.`,
      );
    }
    const imageRefs = value.map((entry) => requireRef(entry, `${label} image_ref`));
    if (new Set(imageRefs).size !== imageRefs.length) {
      throw new Error(`${label} image_refs must not contain duplicates.`);
    }
    return imageRefs.map((ref) => {
      const binding = this.conversations.get(conversationId)?.refs.get(ref);
      if (binding?.kind === 'image') return binding.image;
      if (
        binding?.kind === 'input' &&
        (binding.mediaType === 'image' || binding.mediaType === 'sequence')
      ) {
        return { contentLocator: binding.locator, alias: binding.label };
      }
      if (!binding) {
        throw new Error(`Agent content reference '${ref}' is unknown in this Conversation.`);
      }
      throw new Error(`Agent content reference '${ref}' is not an image reference.`);
    });
  }

  private prepareListDirectory(
    conversationId: string,
    args: Record<string, unknown>,
  ): Record<string, unknown> {
    requireAllowedKeys(args, ['path', 'cursor_ref'], LIST_DIRECTORY_TOOL_NAME);
    const pathValue = optionalRef(args['path'], 'ListDirectory path');
    const cursorRefValue = optionalRef(args['cursor_ref'], 'ListDirectory cursor_ref');
    if ((pathValue === undefined) === (cursorRefValue === undefined)) {
      throw new Error('ListDirectory requires exactly one of path or cursor_ref.');
    }
    if (cursorRefValue !== undefined) {
      const cursor = this.requireBinding(conversationId, cursorRefValue, 'directory-cursor');
      return { path: cursor.directoryPath, after: cursor.after };
    }
    return { path: requireWorkspaceDirectoryPath(pathValue!) };
  }

  private projectDocumentResult(
    conversationId: string,
    result: ToolResult,
  ): Record<string, unknown> {
    const data = requireResultData(result, 'ReadDocument');
    const source = requireContentLocator(data['source'], 'ReadDocument result source');
    const units = readManifestUnits(data['manifest'])
      .slice(0, MAX_MODEL_DOCUMENT_UNITS)
      .map((unit) => {
        const ref = unitRef(source, unit.locator);
        this.bind(conversationId, ref, { kind: 'unit', source, locator: unit.locator });
        return {
          unit_ref: ref,
          kind: unit.kind,
          ...(unit.title === undefined ? {} : { title: unit.title }),
          ...(unit.textPreview === undefined ? {} : { text_preview: unit.textPreview }),
          ...(unit.charCount === undefined ? {} : { char_count: unit.charCount }),
        };
      });
    const cursor = readCursor(data['cursor']);
    const cursorReference = cursor === undefined ? undefined : cursorRef(source, cursor);
    if (cursor && cursorReference) {
      this.bind(conversationId, cursorReference, { kind: 'cursor', source, cursor });
    }
    const imageRefs = readImageInfo(data)
      .slice(0, MAX_MODEL_IMAGE_REFS)
      .map((image, index) => {
        const ref = imageRef(image);
        this.bind(conversationId, ref, { kind: 'image', image });
        return {
          image_ref: ref,
          label: normalizeModelLabel(image.alias ?? image.entryPath ?? `image-${index + 1}`),
          ...(image.width === undefined ? {} : { width: image.width }),
          ...(image.height === undefined ? {} : { height: image.height }),
          ...(image.mimeType === undefined ? {} : { mime_type: image.mimeType }),
        };
      });
    return {
      mode: typeof data['mode'] === 'string' ? data['mode'] : 'content',
      ...(typeof data['text'] === 'string' ? { text: data['text'] } : {}),
      ...(typeof data['totalTextChars'] === 'number'
        ? { total_text_chars: data['totalTextChars'] }
        : {}),
      ...(typeof data['returnedTextChars'] === 'number'
        ? { returned_text_chars: data['returnedTextChars'] }
        : {}),
      ...(data['truncated'] === true ? { truncated: true } : {}),
      ...(typeof data['pageCount'] === 'number' ? { page_count: data['pageCount'] } : {}),
      ...(units.length === 0 ? {} : { units }),
      ...(cursorReference === undefined ? {} : { cursor_ref: cursorReference }),
      ...(imageRefs.length === 0 ? {} : { images: imageRefs }),
      ...(readManifestUnits(data['manifest']).length > units.length
        ? { units_truncated: true }
        : {}),
      ...(readImageInfo(data).length > imageRefs.length || data['imagesTruncated'] === true
        ? { images_truncated: true }
        : {}),
    };
  }

  private projectImageResult(conversationId: string, result: ToolResult): Record<string, unknown> {
    const data = requireResultData(result, 'ReadImage');
    const images = Array.isArray(data['images']) ? data['images'] : [];
    return {
      analysis: typeof data['analysis'] === 'string' ? data['analysis'] : 'describe',
      images: images.slice(0, MAX_MODEL_IMAGE_REFS).flatMap((value, index) => {
        const image = readDocumentImageInfo(value);
        if (!image) return [];
        const ref = imageRef(image);
        this.bind(conversationId, ref, { kind: 'image', image });
        return [
          {
            image_ref: ref,
            label: normalizeModelLabel(image.alias ?? image.entryPath ?? `image-${index + 1}`),
            ...(image.width === undefined ? {} : { width: image.width }),
            ...(image.height === undefined ? {} : { height: image.height }),
            ...(image.mimeType === undefined ? {} : { mime_type: image.mimeType }),
          },
        ];
      }),
      image_count: typeof data['imageCount'] === 'number' ? data['imageCount'] : images.length,
      images_truncated: data['imagesTruncated'] === true,
    };
  }

  private projectSearchResult(conversationId: string, result: ToolResult): Record<string, unknown> {
    const data = requireResultData(result, 'QueryProjectSearch');
    const query = asRecord(data['query']);
    const rawItems = Array.isArray(data['items']) ? data['items'] : [];
    const items = rawItems.slice(0, MAX_MODEL_SEARCH_ITEMS).flatMap((value) => {
      const item = asRecord(value);
      const source = asRecord(item?.['source']);
      if (!item || !source) return [];
      const workspacePath =
        source['sourceKind'] === 'workspace-file' &&
        typeof source['projectRelativePath'] === 'string'
          ? source['projectRelativePath']
          : undefined;
      const locator =
        optionalContentLocator(source['contentLocator']) ??
        (workspacePath === undefined
          ? undefined
          : optionalContentLocator({ kind: 'workspace-file', path: workspacePath }));
      const reference =
        locator === undefined
          ? undefined
          : this.issueContentReference(conversationId, locator, {
              label: readModelLabel(item, locator),
            });
      return [
        {
          ...(typeof item['id'] === 'string' ? { id: item['id'] } : {}),
          ...(typeof item['kind'] === 'string' ? { kind: item['kind'] } : {}),
          ...(typeof item['label'] === 'string' ? { label: item['label'] } : {}),
          ...(typeof item['description'] === 'string' ? { description: item['description'] } : {}),
          ...(typeof item['freshness'] === 'string' ? { freshness: item['freshness'] } : {}),
          source: {
            ...(typeof source['partition'] === 'string' ? { partition: source['partition'] } : {}),
            ...(typeof source['sourceKind'] === 'string'
              ? { source_kind: source['sourceKind'] }
              : {}),
          },
          ...(reference === undefined ? {} : { [reference.field]: reference.ref }),
          ...(reference?.mediaType === 'text' && workspacePath !== undefined
            ? { workspace_path: workspacePath }
            : {}),
        },
      ];
    });
    return {
      ...(query === undefined
        ? {}
        : {
            query: {
              ...(typeof query['text'] === 'string' ? { text: query['text'] } : {}),
              ...(typeof query['mode'] === 'string' ? { mode: query['mode'] } : {}),
              ...(Array.isArray(query['kinds']) ? { kinds: query['kinds'] } : {}),
              ...(Array.isArray(query['partitions']) ? { partitions: query['partitions'] } : {}),
              ...(typeof query['limit'] === 'number' ? { limit: query['limit'] } : {}),
            },
          }),
      items,
      item_count: typeof data['itemCount'] === 'number' ? data['itemCount'] : rawItems.length,
      ...(rawItems.length > items.length ? { items_truncated: true } : {}),
    };
  }

  private projectDirectoryResult(
    conversationId: string,
    result: ToolResult,
  ): Record<string, unknown> {
    const data = requireResultData(result, LIST_DIRECTORY_TOOL_NAME);
    const directoryPath = requireWorkspaceDirectoryPath(data['directoryPath']);
    const rawEntries = Array.isArray(data['entries']) ? data['entries'] : [];
    let invalidEntryCount = 0;
    const entries = rawEntries.flatMap((value) => {
      const entry = asRecord(value);
      if (
        !entry ||
        !isPortableDirectoryEntryName(entry['name']) ||
        typeof entry['type'] !== 'string'
      ) {
        invalidEntryCount += 1;
        return [];
      }
      const base = {
        name: normalizeModelLabel(entry['name']),
        kind: entry['type'],
        ...(typeof entry['size'] === 'number' ? { size_bytes: entry['size'] } : {}),
      };
      const locator = optionalContentLocator(entry['contentLocator']);
      if (entry['type'] === 'directory') {
        if (
          locator?.kind !== 'workspace-file' ||
          locator.path !== workspaceDirectoryEntryPath(directoryPath, entry['name'])
        ) {
          invalidEntryCount += 1;
          return [{ ...base, availability: 'invalid-entry' }];
        }
        return [
          {
            ...base,
            directory_path: locator.path,
          },
        ];
      }
      if (entry['type'] !== 'file') return [base];
      if (
        locator?.kind !== 'workspace-file' ||
        locator.path !== workspaceDirectoryEntryPath(directoryPath, entry['name'])
      ) {
        invalidEntryCount += 1;
        return [{ ...base, availability: 'invalid-entry' }];
      }

      const classification = classifyAgentContentPath(locator.path);
      if (classification.kind === 'text') {
        return [{ ...base, media_type: 'text', workspace_path: locator.path }];
      }
      if (classification.kind === 'unknown') {
        return [
          {
            ...base,
            media_type: 'unknown',
            workspace_path: locator.path,
            text_validation_required: true,
          },
        ];
      }
      if (classification.kind === 'canvas-project' || classification.kind === 'cut-project') {
        return [
          {
            ...base,
            media_type: 'protected-project',
            domain_owner: classification.domainOwner,
          },
        ];
      }
      if (
        classification.kind === 'score' ||
        classification.kind === 'archive' ||
        classification.kind === 'executable'
      ) {
        return [
          {
            ...base,
            media_type: classification.kind,
            availability: 'processor-unavailable',
            processor_requirement: classification.processorRequirement,
          },
        ];
      }
      const reference = this.issueContentReference(conversationId, locator, {
        label: entry['name'],
        mimeType: classification.mimeType,
      });
      return [
        {
          ...base,
          media_type: classification.mediaType ?? classification.kind,
          [reference.field]: reference.ref,
        },
      ];
    });
    const rawNextCursor = data['nextCursor'];
    const nextCursor = asRecord(rawNextCursor);
    let nextCursorRef: string | undefined;
    if (rawNextCursor !== undefined && !nextCursor) {
      throw new Error('ListDirectory result nextCursor is invalid.');
    }
    if (nextCursor) {
      if (
        typeof nextCursor['directoryPath'] !== 'string' ||
        !isPortableDirectoryEntryName(nextCursor['after'])
      ) {
        throw new Error('ListDirectory result nextCursor is invalid.');
      }
      const nextDirectoryPath = requireWorkspaceDirectoryPath(nextCursor['directoryPath']);
      if (nextDirectoryPath !== directoryPath) {
        throw new Error('ListDirectory result nextCursor does not match its directory.');
      }
      nextCursorRef = createRef('cursor', {
        kind: 'directory',
        directoryPath: nextDirectoryPath,
        after: nextCursor['after'],
      });
      this.bind(conversationId, nextCursorRef, {
        kind: 'directory-cursor',
        directoryPath: nextDirectoryPath,
        after: nextCursor['after'],
      });
    }
    return {
      directory_path: directoryPath,
      entries,
      entry_count: entries.length,
      total_entries:
        typeof data['totalEntries'] === 'number' ? data['totalEntries'] : rawEntries.length,
      truncated: data['truncated'] === true,
      ...(invalidEntryCount === 0 ? {} : { invalid_entry_count: invalidEntryCount }),
      ...(nextCursorRef === undefined ? {} : { next_cursor_ref: nextCursorRef }),
    };
  }

  private projectPortableToolResult(
    conversationId: string,
    result: ToolResult,
  ):
    | { readonly value: unknown; readonly references: readonly IssuedContentReference[] }
    | undefined {
    const references = new Map<string, IssuedContentReference>();
    for (const attachment of result.attachments ?? []) {
      const contentLocator = optionalContentLocator(
        attachment.contentLocator ?? attachment.assetRef?.contentLocator,
      );
      const representationLocator = isContentRepresentationLocator(
        attachment.assetRef?.representationLocator,
      )
        ? attachment.assetRef.representationLocator
        : undefined;
      if (!contentLocator && !representationLocator) continue;
      const reference =
        attachment.type === 'image'
          ? this.issueImageReference(conversationId, {
              ...(attachment.assetRef?.label ? { alias: attachment.assetRef.label } : {}),
              ...((attachment.mimeType ?? attachment.assetRef?.mimeType)
                ? { mimeType: attachment.mimeType ?? attachment.assetRef?.mimeType }
                : {}),
              ...(contentLocator ? { contentLocator } : {}),
              ...(representationLocator ? { representationLocator } : {}),
            })
          : contentLocator
            ? this.issueInputReference(conversationId, contentLocator, {
                mediaType: attachment.type,
              })
            : undefined;
      if (!reference) continue;
      references.set(reference.ref, reference);
    }
    const projected = this.projectPortableValue(conversationId, result.data, references);
    if (!projected.changed && references.size === 0) return undefined;
    const contentRefs = [...references.values()].map(projectContentReference);
    if (asRecord(projected.value)) {
      return {
        value: {
          ...(projected.value as Record<string, unknown>),
          ...(contentRefs.length === 0 ? {} : { content_refs: contentRefs }),
        },
        references: [...references.values()],
      };
    }
    return {
      value: {
        result: projected.value,
        ...(contentRefs.length === 0 ? {} : { content_refs: contentRefs }),
      },
      references: [...references.values()],
    };
  }

  private projectPortableValue(
    conversationId: string,
    value: unknown,
    references: Map<string, IssuedContentReference>,
  ): { readonly value: unknown; readonly changed: boolean } {
    const directLocator = optionalContentLocator(value);
    if (directLocator) {
      const reference = this.issueContentReference(conversationId, directLocator, {});
      references.set(reference.ref, reference);
      return { value: { [reference.field]: reference.ref }, changed: true };
    }
    if (Array.isArray(value)) {
      let changed = false;
      const projected = value.map((entry) => {
        const next = this.projectPortableValue(conversationId, entry, references);
        changed ||= next.changed;
        return next.value;
      });
      return { value: projected, changed };
    }
    const record = asRecord(value);
    if (!record) return { value, changed: false };

    let changed = false;
    const projected: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      if (key === 'contentLocator' || key === 'locator') {
        const locator = optionalContentLocator(entry);
        if (locator) {
          const reference = this.issueContentReference(conversationId, locator, {
            label: readModelLabel(record, locator),
            mimeType: typeof record['mimeType'] === 'string' ? record['mimeType'] : undefined,
          });
          references.set(reference.ref, reference);
          projected[reference.field] = reference.ref;
          changed = true;
          continue;
        }
      }
      if (key === 'representationLocator' && isContentRepresentationLocator(entry)) {
        const reference = this.issueImageReference(conversationId, {
          representationLocator: entry,
          ...(typeof record['mimeType'] === 'string' ? { mimeType: record['mimeType'] } : {}),
          ...(typeof record['label'] === 'string' ? { alias: record['label'] } : {}),
        });
        references.set(reference.ref, reference);
        projected[reference.field] = reference.ref;
        changed = true;
        continue;
      }
      const next = this.projectPortableValue(conversationId, entry, references);
      projected[key] = next.value;
      changed ||= next.changed;
    }
    return { value: projected, changed };
  }

  private issueContentReference(
    conversationId: string,
    locator: ContentLocator,
    hints: { readonly label?: string; readonly mimeType?: string },
  ): IssuedContentReference {
    const classification = classifyAgentContentPath(contentLocatorPortablePath(locator));
    const mimeType = hints.mimeType ?? classification.mimeType;
    if (classification.kind === 'image') {
      return this.issueImageReference(conversationId, {
        alias: hints.label ?? contentLocatorLabel(locator),
        mimeType,
        contentLocator: locator,
      });
    }
    const mediaType = classification.mediaType;
    return this.issueInputReference(conversationId, locator, {
      label: hints.label,
      ...(mediaType === undefined ? {} : { mediaType }),
    });
  }

  private issueInputReference(
    conversationId: string,
    locator: ContentLocator,
    hints: { readonly label?: string; readonly mediaType?: string },
  ): IssuedContentReference {
    const ref = createRef('input', { locator });
    const label = normalizeModelLabel(hints.label ?? contentLocatorLabel(locator));
    this.bind(conversationId, ref, {
      kind: 'input',
      locator,
      label,
      ...(hints.mediaType === undefined ? {} : { mediaType: hints.mediaType }),
    });
    return {
      ref,
      field: 'input_ref',
      label,
      ...(hints.mediaType === undefined ? {} : { mediaType: hints.mediaType }),
    };
  }

  private issueImageReference(conversationId: string, image: BoundImage): IssuedContentReference {
    const ref = imageRef(image);
    this.bind(conversationId, ref, { kind: 'image', image });
    return {
      ref,
      field: 'image_ref',
      label: normalizeModelLabel(
        image.alias ??
          image.entryPath ??
          (image.contentLocator ? contentLocatorLabel(image.contentLocator) : 'image'),
      ),
      mediaType: 'image',
    };
  }

  private restoreInputReference(conversationId: string, reference: MessageContextReference): void {
    if (!reference.contentLocator) return;
    const ref = createAgentInputReferenceId(reference.id, reference.contentLocator);
    this.bind(conversationId, ref, {
      kind: 'input',
      locator: reference.contentLocator,
      label: reference.label,
      ...(reference.mediaType === undefined ? {} : { mediaType: reference.mediaType }),
    });
  }

  private bind(conversationId: string, ref: string, binding: Binding): void {
    const conversation = this.requireConversation(conversationId);
    const existing = conversation.refs.get(ref);
    if (existing && !sameBindingTarget(existing, binding)) {
      throw new Error(`Agent content reference collision for '${ref}'.`);
    }
    if (!existing) conversation.refs.set(ref, binding);
  }

  private requireBinding<TKind extends Binding['kind']>(
    conversationId: string,
    ref: string,
    kind: TKind,
  ): Extract<Binding, { readonly kind: TKind }> {
    const binding = this.conversations.get(conversationId)?.refs.get(ref);
    if (!binding) {
      throw new Error(`Agent content reference '${ref}' is unknown in this Conversation.`);
    }
    if (binding.kind !== kind) {
      throw new Error(`Agent content reference '${ref}' is not a ${kind} reference.`);
    }
    return binding as Extract<Binding, { readonly kind: TKind }>;
  }

  private requireConversation(conversationId: string): ConversationBindings {
    const existing = this.conversations.get(conversationId);
    if (existing) return existing;
    const created: ConversationBindings = { refs: new Map() };
    this.conversations.set(conversationId, created);
    return created;
  }
}

function requireResultData(result: ToolResult, label: string): Record<string, unknown> {
  const data = asRecord(result.data);
  if (!data) throw new Error(`${label} returned no structured data.`);
  return data;
}

function readManifestUnits(value: unknown): readonly {
  readonly kind: string;
  readonly locator: DocumentLocator;
  readonly title?: string;
  readonly textPreview?: string;
  readonly charCount?: number;
}[] {
  const manifest = asRecord(value);
  if (!Array.isArray(manifest?.['units'])) return [];
  return manifest['units'].flatMap((value) => {
    const unit = asRecord(value);
    const locator = parseDocumentLocator(unit?.['locator']);
    if (!unit || !locator || typeof unit['kind'] !== 'string') return [];
    return [
      {
        kind: unit['kind'],
        locator,
        ...(typeof unit['title'] === 'string' ? { title: unit['title'] } : {}),
        ...(typeof unit['textPreview'] === 'string' ? { textPreview: unit['textPreview'] } : {}),
        ...(typeof unit['charCount'] === 'number' ? { charCount: unit['charCount'] } : {}),
      },
    ];
  });
}

function readImageInfo(data: Record<string, unknown>): readonly BoundImage[] {
  const direct = Array.isArray(data['imageInfo']) ? data['imageInfo'] : [];
  const excerpt = asRecord(data['excerpt']);
  const nested = Array.isArray(excerpt?.['imageInfo']) ? excerpt['imageInfo'] : [];
  return [...direct, ...nested].flatMap((value) => {
    const image = readDocumentImageInfo(value);
    return image ? [image] : [];
  });
}

function readDocumentImageInfo(value: unknown): BoundImage | undefined {
  const image = asRecord(value);
  if (!image) return undefined;
  const contentLocator = optionalContentLocator(image['contentLocator']);
  const representationLocator = isContentRepresentationLocator(image['representationLocator'])
    ? image['representationLocator']
    : undefined;
  if (!contentLocator && !representationLocator) return undefined;
  return {
    ...(typeof image['alias'] === 'string' ? { alias: image['alias'] } : {}),
    ...(typeof image['entryPath'] === 'string' ? { entryPath: image['entryPath'] } : {}),
    ...(typeof image['width'] === 'number' ? { width: image['width'] } : {}),
    ...(typeof image['height'] === 'number' ? { height: image['height'] } : {}),
    ...(typeof image['mimeType'] === 'string' ? { mimeType: image['mimeType'] } : {}),
    ...(contentLocator ? { contentLocator } : {}),
    ...(representationLocator ? { representationLocator } : {}),
  };
}

function readCursor(value: unknown): DocumentBatchCursor | undefined {
  const cursor = asRecord(value);
  const source = asRecord(cursor?.['source']);
  const sourceContent = optionalContentLocator(source?.['contentLocator']);
  if (
    !cursor ||
    !source ||
    !sourceContent ||
    sourceContent.kind !== 'workspace-file' ||
    cursor['strategy'] !== 'manifest-order' ||
    typeof cursor['batchIndex'] !== 'number' ||
    typeof cursor['done'] !== 'boolean' ||
    typeof source['filePath'] !== 'string' ||
    !isDocumentFormat(source['format'])
  )
    return undefined;
  const next = cursor['next'] === undefined ? undefined : parseDocumentLocator(cursor['next']);
  if (cursor['next'] !== undefined && !next) return undefined;
  return {
    source: {
      filePath: source['filePath'],
      format: source['format'],
      contentLocator: sourceContent,
    },
    strategy: 'manifest-order',
    batchIndex: cursor['batchIndex'],
    done: cursor['done'],
    ...(next ? { next } : {}),
    ...(typeof cursor['fileId'] === 'string' ? { fileId: cursor['fileId'] } : {}),
    ...(typeof cursor['maxChars'] === 'number' ? { maxChars: cursor['maxChars'] } : {}),
  };
}

function requireContentLocator(value: unknown, label: string): ContentLocator {
  const result = validateContentLocator(value);
  if (!result.ok) throw new Error(`${label} is invalid.`);
  return result.locator;
}

function optionalContentLocator(value: unknown): ContentLocator | undefined {
  const result = validateContentLocator(value);
  return result.ok ? result.locator : undefined;
}

function unitRef(source: ContentLocator, locator: DocumentLocator): string {
  return createRef('unit', { source, locator });
}

function cursorRef(source: ContentLocator, cursor: DocumentBatchCursor): string {
  return createRef('cursor', { source, cursor });
}

function imageRef(image: BoundImage): string {
  return createRef('image', {
    contentLocator: image.contentLocator,
    representationLocator: image.representationLocator,
  });
}

function projectContentReference(reference: IssuedContentReference): Record<string, unknown> {
  return {
    [reference.field]: reference.ref,
    label: reference.label,
    ...(reference.mediaType === undefined ? {} : { media_type: reference.mediaType }),
  };
}

function readModelLabel(record: Record<string, unknown>, locator: ContentLocator): string {
  for (const key of ['label', 'name', 'alias', 'entryPath', 'path']) {
    if (typeof record[key] === 'string' && record[key].trim().length > 0) {
      return normalizeModelLabel(record[key].trim());
    }
  }
  return contentLocatorLabel(locator);
}

function contentLocatorLabel(locator: ContentLocator): string {
  switch (locator.kind) {
    case 'workspace-file':
    case 'generated-output':
      return portableBaseName(locator.path);
    case 'document-entry':
      return portableBaseName(locator.entryPath);
    case 'package-resource':
      return portableBaseName(locator.resourcePath);
  }
}

function portableBaseName(value: string): string {
  return value.split(/[\\/]/u).at(-1) ?? value;
}

function normalizeModelLabel(value: string): string {
  return value.includes('/') || value.includes('\\') ? portableBaseName(value) : value;
}

function contentLocatorPortablePath(locator: ContentLocator): string {
  switch (locator.kind) {
    case 'workspace-file':
    case 'generated-output':
      return locator.path;
    case 'document-entry':
      return locator.entryPath;
    case 'package-resource':
      return locator.resourcePath;
  }
}

function sameBindingTarget(left: Binding, right: Binding): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case 'input':
      return right.kind === 'input' && stableJson(left.locator) === stableJson(right.locator);
    case 'unit':
      return (
        right.kind === 'unit' &&
        stableJson({ source: left.source, locator: left.locator }) ===
          stableJson({ source: right.source, locator: right.locator })
      );
    case 'cursor':
      return (
        right.kind === 'cursor' &&
        stableJson({ source: left.source, cursor: left.cursor }) ===
          stableJson({ source: right.source, cursor: right.cursor })
      );
    case 'image':
      return (
        right.kind === 'image' &&
        stableJson({
          contentLocator: left.image.contentLocator,
          representationLocator: left.image.representationLocator,
        }) ===
          stableJson({
            contentLocator: right.image.contentLocator,
            representationLocator: right.image.representationLocator,
          })
      );
    case 'directory-cursor':
      return (
        right.kind === 'directory-cursor' &&
        left.directoryPath === right.directoryPath &&
        left.after === right.after
      );
  }
}

function createRef(prefix: string, value: unknown): string {
  let hash = 0x811c9dc5;
  const source = stableJson(value);
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  const record = asRecord(value);
  if (!record) return value;
  return Object.fromEntries(
    Object.entries(record)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortJson(entry)]),
  );
}

function requireAllowedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`${label} contains unsupported field '${unknown}'.`);
}

function requireRef(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\u0000')) {
    throw new Error(`${label} must be a non-empty short reference.`);
  }
  return value.trim();
}

function optionalRef(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : requireRef(value, label);
}

function optionalBoundedText(value: unknown, label: string, maxChars: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\u0000')) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  const text = value.trim();
  if (text.length > maxChars) throw new Error(`${label} must not exceed ${maxChars} characters.`);
  return text;
}

function requireWorkspaceDirectoryPath(value: unknown): string {
  const directoryPath = requireRef(value, 'ListDirectory path');
  if (directoryPath === '.') return directoryPath;
  if (
    directoryPath.length > 1024 ||
    directoryPath.startsWith('/') ||
    directoryPath.includes('\\') ||
    /^[a-z]:/iu.test(directoryPath)
  ) {
    throw new Error('ListDirectory path must be a portable Workspace-relative path.');
  }
  const segments = directoryPath.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('ListDirectory path must be normalized inside the Workspace.');
  }
  return directoryPath;
}

function isPortableDirectoryEntryName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !value.includes('\u0000')
  );
}

function workspaceDirectoryEntryPath(directoryPath: string, name: string): string {
  return directoryPath === '.' ? name : `${directoryPath}/${name}`;
}

function readMode(value: unknown): 'content' | 'manifest' | 'range' | 'next' {
  if (value === undefined || value === 'content') return 'content';
  if (value === 'manifest' || value === 'range' || value === 'next') return value;
  throw new Error('ReadDocument mode must be content, manifest, range, or next.');
}

function readBoundedInteger(
  value: unknown,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`ReadDocument max_chars must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function assertSameSource(expected: ContentLocator, actual: ContentLocator, ref: string): void {
  if (stableJson(expected) !== stableJson(actual)) {
    throw new Error(`Agent document unit reference '${ref}' belongs to another source.`);
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
