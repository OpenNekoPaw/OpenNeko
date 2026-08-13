import type { SessionTreeEntry } from '@earendil-works/pi-agent-core';
import {
  TOOL_NAMES_MEDIA,
  TOOL_NAMES_PERCEPTION,
  TOOL_NAMES_SEARCH,
  TOOL_NAMES_SYSTEM,
  type AgentContextPayload,
  type Tool,
} from '@neko/agent-contracts';
import { describe, expect, it } from 'vitest';

import type { PiCapabilityToolContext } from '../pi/capability-tool-bridge';
import { projectOpenNekoTool } from '../pi/openneko-tool';
import { PiContentToolModelProtocol } from './pi-content-tool-model-protocol';

const SOURCE = { kind: 'workspace-file' as const, path: 'books/book.pdf' };
const IMAGE = {
  kind: 'document-entry' as const,
  source: SOURCE,
  entryPath: 'pages/page-1.png',
};
const GENERATED_IMAGE = {
  kind: 'generated-output' as const,
  outputId: 'output-1',
  digest: 'sha256:generated-image',
  path: 'neko/generated/image/output-1.png',
};

describe('Pi content Tool model protocol', () => {
  it('projects short provider schemas and resolves them to canonical domain arguments', () => {
    const protocol = new PiContentToolModelProtocol();
    const refs = protocol.bindInputs('conversation-1', [documentPayload()]);
    const inputRef = refs.get('file:book.pdf');
    expect(inputRef).toMatch(/^input_[a-z0-9]+$/u);

    const definition = protocol.projectDefinition(tool(TOOL_NAMES_SYSTEM.READ_DOCUMENT));
    expect(definition?.parameters.properties).toHaveProperty('input_ref');
    expect(JSON.stringify(definition)).not.toMatch(
      /ContentLocator|DocumentLocator|fingerprint|representationLocator|entryPath/u,
    );

    expect(
      protocol.prepareArguments({
        tool: tool(TOOL_NAMES_SYSTEM.READ_DOCUMENT),
        args: { input_ref: inputRef, mode: 'manifest', max_chars: 12_000 },
        context: context('conversation-1'),
      }),
    ).toEqual({
      source: SOURCE,
      mode: 'manifest',
      start_batch: true,
      include_manifest: true,
      include_images: true,
      max_chars: 12_000,
      max_images: 5,
    });
  });

  it('projects bounded unit, cursor, and image refs without exposing locator data', () => {
    const protocol = new PiContentToolModelProtocol();
    const inputRef = protocol
      .bindInputs('conversation-1', [documentPayload()])
      .get('file:book.pdf');
    const result = readDocumentResult();
    const text = protocol.projectResultText({
      tool: tool(TOOL_NAMES_SYSTEM.READ_DOCUMENT),
      result,
      context: context('conversation-1'),
    });
    const projected = JSON.parse(requireText(text)) as {
      units: readonly { unit_ref: string }[];
      cursor_ref: string;
      images: readonly { image_ref: string }[];
    };

    expect(text).not.toContain('books/book.pdf');
    expect(text).not.toContain('contentLocator');
    expect(projected.units[0]?.unit_ref).toMatch(/^unit_[a-z0-9]+$/u);
    expect(projected.cursor_ref).toMatch(/^cursor_[a-z0-9]+$/u);
    expect(projected.images[0]?.image_ref).toMatch(/^image_[a-z0-9]+$/u);

    expect(
      protocol.prepareArguments({
        tool: tool(TOOL_NAMES_SYSTEM.READ_DOCUMENT),
        args: {
          input_ref: inputRef,
          mode: 'range',
          unit_ref: projected.units[0]?.unit_ref,
        },
        context: context('conversation-1'),
      }),
    ).toMatchObject({
      source: SOURCE,
      mode: 'range',
      range: { locator: { kind: 'page', pageNumber: 1, pageIndex: 0 } },
    });

    expect(
      protocol.prepareArguments({
        tool: tool(TOOL_NAMES_SYSTEM.READ_IMAGE),
        args: { image_refs: [projected.images[0]?.image_ref], analysis: 'ocr' },
        context: context('conversation-1'),
      }),
    ).toMatchObject({
      mode: 'metadata',
      max_images: 1,
      images: [{ contentLocator: IMAGE }],
    });
  });

  it('rejects oversized, unknown, and cross-Conversation image references locally', () => {
    const protocol = new PiContentToolModelProtocol();
    const inputRef = protocol.bindInputs('conversation-1', [imagePayload()]).get('file:page.png');

    expect(() =>
      protocol.prepareArguments({
        tool: tool(TOOL_NAMES_SYSTEM.READ_IMAGE),
        args: { image_refs: Array.from({ length: 6 }, (_, index) => `${inputRef}-${index}`) },
        context: context('conversation-1'),
      }),
    ).toThrow('at most 5');
    expect(() =>
      protocol.prepareArguments({
        tool: tool(TOOL_NAMES_SYSTEM.READ_IMAGE),
        args: { image_refs: [inputRef] },
        context: context('conversation-2'),
      }),
    ).toThrow('unknown in this Conversation');
    expect(() =>
      protocol.prepareArguments({
        tool: tool(TOOL_NAMES_SYSTEM.READ_DOCUMENT),
        args: { input_ref: inputRef, mode: 'content', locator: SOURCE },
        context: context('conversation-1'),
      }),
    ).toThrow("unsupported field 'locator'");
  });

  it('projects external image understanding with only bounded Conversation refs and focus', () => {
    const protocol = new PiContentToolModelProtocol();
    const inputRef = protocol.bindInputs('conversation-1', [imagePayload()]).get('file:page.png');
    const definition = protocol.projectDefinition(tool(TOOL_NAMES_PERCEPTION.IMAGE_UNDERSTAND));

    expect(definition?.parameters).toMatchObject({
      required: ['image_refs'],
      additionalProperties: false,
      properties: {
        image_refs: { maxItems: 5 },
        focus: { maxLength: 4_000 },
      },
    });
    expect(JSON.stringify(definition?.parameters)).not.toMatch(
      /ContentLocator|providerId|modelId|path/u,
    );
    expect(
      protocol.prepareArguments({
        tool: tool(TOOL_NAMES_PERCEPTION.IMAGE_UNDERSTAND),
        args: { image_refs: [inputRef], focus: 'Read the title.' },
        context: context('conversation-1'),
      }),
    ).toEqual({
      images: [
        {
          contentLocator: { kind: 'workspace-file', path: 'page.png' },
          alias: 'page.png',
        },
      ],
      focus: 'Read the title.',
    });

    for (const forbidden of ['provider', 'model', 'path', 'locator']) {
      expect(() =>
        protocol.prepareArguments({
          tool: tool(TOOL_NAMES_PERCEPTION.IMAGE_UNDERSTAND),
          args: { image_refs: [inputRef], [forbidden]: 'forbidden' },
          context: context('conversation-1'),
        }),
      ).toThrow(`unsupported field '${forbidden}'`);
    }
    expect(() =>
      protocol.prepareArguments({
        tool: tool(TOOL_NAMES_PERCEPTION.IMAGE_UNDERSTAND),
        args: { image_refs: [inputRef, inputRef] },
        context: context('conversation-1'),
      }),
    ).toThrow('must not contain duplicates');
    expect(() =>
      protocol.prepareArguments({
        tool: tool(TOOL_NAMES_PERCEPTION.IMAGE_UNDERSTAND),
        args: { image_refs: [inputRef] },
        context: context('conversation-2'),
      }),
    ).toThrow('unknown in this Conversation');
  });

  it('rebuilds input and Tool-result bindings from persisted Pi entries', () => {
    const seed = new PiContentToolModelProtocol();
    seed.bindInputs('conversation-1', [documentPayload()]);
    const projected = JSON.parse(
      requireText(
        seed.projectResultText({
          tool: tool(TOOL_NAMES_SYSTEM.READ_DOCUMENT),
          result: readDocumentResult(),
          context: context('conversation-1'),
        }),
      ),
    ) as { cursor_ref: string; images: readonly { image_ref: string }[] };

    const restored = new PiContentToolModelProtocol();
    restored.restoreConversation('conversation-1', persistedEntries());

    expect(
      restored.prepareArguments({
        tool: tool(TOOL_NAMES_SYSTEM.READ_DOCUMENT),
        args: { mode: 'next', cursor_ref: projected.cursor_ref },
        context: context('conversation-1'),
      }),
    ).toMatchObject({ source: SOURCE, mode: 'next' });
    expect(
      restored.prepareArguments({
        tool: tool(TOOL_NAMES_SYSTEM.READ_IMAGE),
        args: { image_refs: [projected.images[0]?.image_ref] },
        context: context('conversation-1'),
      }),
    ).toMatchObject({ images: [{ contentLocator: IMAGE }] });
  });

  it('projects generated image Tool results as short refs while retaining canonical details', () => {
    const protocol = new PiContentToolModelProtocol();
    const result = generatedImageResult();
    const text = requireText(
      protocol.projectResultText({
        tool: tool(TOOL_NAMES_MEDIA.GENERATE_IMAGE),
        result,
        context: context('conversation-1'),
      }),
    );
    const projected = JSON.parse(text) as {
      outputs: readonly { image_ref: string }[];
      content_refs: readonly { image_ref: string }[];
    };

    expect(text).not.toContain('generated-output');
    expect(text).not.toContain('neko/generated/image');
    expect(projected.outputs[0]?.image_ref).toMatch(/^image_[a-z0-9]+$/u);
    expect(projected.content_refs[0]?.image_ref).toBe(projected.outputs[0]?.image_ref);
    expect(result.data.outputs[0]?.contentLocator).toEqual(GENERATED_IMAGE);
    expect(
      protocol.prepareArguments({
        tool: tool(TOOL_NAMES_SYSTEM.READ_IMAGE),
        args: { image_refs: [projected.outputs[0]?.image_ref] },
        context: context('conversation-1'),
      }),
    ).toMatchObject({ images: [{ contentLocator: GENERATED_IMAGE }] });
  });

  it('projects Workspace search results with short refs instead of model-constructed paths', () => {
    const protocol = new PiContentToolModelProtocol();
    const text = requireText(
      protocol.projectResultText({
        tool: tool(TOOL_NAMES_SEARCH.QUERY_PROJECT_SEARCH),
        result: searchResult(),
        context: context('conversation-1'),
      }),
    );
    const projected = JSON.parse(text) as { items: readonly { image_ref: string }[] };

    expect(text).not.toContain('Reference/library-image.png');
    expect(text).not.toContain('/Users/example/private-workspace');
    expect(projected.items[0]?.image_ref).toMatch(/^image_[a-z0-9]+$/u);
    expect(
      protocol.prepareArguments({
        tool: tool(TOOL_NAMES_SYSTEM.READ_IMAGE),
        args: { image_refs: [projected.items[0]?.image_ref] },
        context: context('conversation-1'),
      }),
    ).toMatchObject({
      images: [
        {
          contentLocator: {
            kind: 'media-library',
            libraryName: 'Reference',
            relativePath: 'library-image.png',
          },
        },
      ],
    });
  });

  it('projects one directory level with format-specific paths and references', () => {
    const protocol = new PiContentToolModelProtocol();
    const definition = protocol.projectDefinition(tool('ListDirectory'));
    const providerTool = projectOpenNekoTool(tool('ListDirectory'), { modelProtocol: protocol });

    expect(definition?.parameters.properties).toHaveProperty('path');
    expect(definition?.parameters.properties).toHaveProperty('cursor_ref');
    expect(definition?.parameters).toHaveProperty('anyOf');
    expect(providerTool.parameters).toMatchObject({
      type: 'object',
      properties: {
        path: { type: 'string' },
        cursor_ref: { type: 'string' },
      },
      additionalProperties: false,
    });
    for (const keyword of ['oneOf', 'anyOf', 'allOf', 'enum', 'const', 'not']) {
      expect(providerTool.parameters).not.toHaveProperty(keyword);
    }
    expect(JSON.stringify(definition)).not.toMatch(/absolute|recursive|contentLocator|after/u);

    const text = requireText(
      protocol.projectResultText({
        tool: tool('ListDirectory'),
        result: directoryResult(),
        context: context('conversation-1'),
      }),
    );
    const projected = JSON.parse(text) as {
      entries: readonly Record<string, unknown>[];
      next_cursor_ref: string;
      invalid_entry_count: number;
    };
    const entries = Object.fromEntries(projected.entries.map((entry) => [entry['name'], entry]));

    expect(text).not.toContain('contentLocator');
    expect(text).not.toContain('/Users/example/private-workspace');
    expect(text).not.toContain('private/escaped.txt');
    expect(entries['notes.md']).toMatchObject({
      media_type: 'text',
      workspace_path: 'materials/notes.md',
    });
    expect(entries['book.epub']?.['input_ref']).toMatch(/^input_[a-z0-9]+$/u);
    expect(entries['cover.png']?.['image_ref']).toMatch(/^image_[a-z0-9]+$/u);
    expect(entries['theme.mp3']?.['input_ref']).toMatch(/^input_[a-z0-9]+$/u);
    expect(entries['workspace.nkc']).toMatchObject({
      media_type: 'protected-project',
      domain_owner: 'canvas',
    });
    expect(entries['source.zip']).toMatchObject({
      media_type: 'archive',
      availability: 'processor-unavailable',
    });
    expect(entries['escaped.txt']).toMatchObject({ availability: 'invalid-entry' });
    expect(projected.invalid_entry_count).toBe(1);
    expect(projected.next_cursor_ref).toMatch(/^cursor_[a-z0-9]+$/u);

    expect(
      protocol.prepareArguments({
        tool: tool('ListDirectory'),
        args: { cursor_ref: projected.next_cursor_ref },
        context: context('conversation-1'),
      }),
    ).toEqual({ path: 'materials', after: 'workspace.nkc' });
  });

  it('rejects non-portable directory paths and undeclared directory arguments', () => {
    const protocol = new PiContentToolModelProtocol();
    for (const invalidPath of ['/tmp', '../private', 'materials/../private', 'C:/private']) {
      expect(() =>
        protocol.prepareArguments({
          tool: tool('ListDirectory'),
          args: { path: invalidPath },
          context: context('conversation-1'),
        }),
      ).toThrow(/Workspace|normalized/u);
    }
    expect(() =>
      protocol.prepareArguments({
        tool: tool('ListDirectory'),
        args: { path: '.', recursive: true },
        context: context('conversation-1'),
      }),
    ).toThrow("unsupported field 'recursive'");

    const result = directoryResult();
    expect(() =>
      protocol.projectResultText({
        tool: tool('ListDirectory'),
        result: {
          ...result,
          data: {
            ...result.data,
            nextCursor: { directoryPath: 'private', after: 'workspace.nkc' },
          },
        },
        context: context('conversation-1'),
      }),
    ).toThrow('nextCursor does not match its directory');
  });

  it('restores directory references and continuation from persisted Tool details', () => {
    const seed = new PiContentToolModelProtocol();
    const projected = JSON.parse(
      requireText(
        seed.projectResultText({
          tool: tool('ListDirectory'),
          result: directoryResult(),
          context: context('conversation-1'),
        }),
      ),
    ) as { entries: readonly Record<string, unknown>[]; next_cursor_ref: string };
    const bookRef = projected.entries.find((entry) => entry['name'] === 'book.epub')?.['input_ref'];
    const imageRef = projected.entries.find((entry) => entry['name'] === 'cover.png')?.[
      'image_ref'
    ];

    const restored = new PiContentToolModelProtocol();
    restored.restoreConversation('conversation-1', [persistedDirectoryEntry()]);

    expect(
      restored.prepareArguments({
        tool: tool(TOOL_NAMES_SYSTEM.READ_DOCUMENT),
        args: { input_ref: bookRef },
        context: context('conversation-1'),
      }),
    ).toMatchObject({ source: { kind: 'workspace-file', path: 'materials/book.epub' } });
    expect(
      restored.prepareArguments({
        tool: tool(TOOL_NAMES_SYSTEM.READ_IMAGE),
        args: { image_refs: [imageRef] },
        context: context('conversation-1'),
      }),
    ).toMatchObject({
      images: [{ contentLocator: { kind: 'workspace-file', path: 'materials/cover.png' } }],
    });
    expect(
      restored.prepareArguments({
        tool: tool('ListDirectory'),
        args: { cursor_ref: projected.next_cursor_ref },
        context: context('conversation-1'),
      }),
    ).toEqual({ path: 'materials', after: 'workspace.nkc' });
  });

  it('rebuilds generic Tool-result refs and bounds oversized model text', () => {
    const restored = new PiContentToolModelProtocol();
    restored.restoreConversation('conversation-1', [persistedGeneratedImageEntry()]);
    const seed = new PiContentToolModelProtocol();
    const projected = JSON.parse(
      requireText(
        seed.projectResultText({
          tool: tool(TOOL_NAMES_MEDIA.GENERATE_IMAGE),
          result: generatedImageResult('x'.repeat(30_000)),
          context: context('conversation-1'),
        }),
      ),
    ) as { content_refs: readonly { image_ref: string }[]; result_truncated: boolean };

    expect(projected.result_truncated).toBe(true);
    expect(
      restored.prepareArguments({
        tool: tool(TOOL_NAMES_SYSTEM.READ_IMAGE),
        args: { image_refs: [projected.content_refs[0]?.image_ref] },
        context: context('conversation-1'),
      }),
    ).toMatchObject({ images: [{ contentLocator: GENERATED_IMAGE }] });
  });
});

function documentPayload(): AgentContextPayload {
  return {
    type: 'file',
    id: 'file:book.pdf',
    label: 'book.pdf',
    summary: 'Book',
    data: {
      kind: 'authorized-content-reference',
      locator: SOURCE,
      mediaType: 'document',
    },
  };
}

function imagePayload(): AgentContextPayload {
  return {
    type: 'image',
    id: 'file:page.png',
    label: 'page.png',
    summary: 'Page',
    data: {
      kind: 'authorized-content-reference',
      locator: { kind: 'workspace-file', path: 'page.png' },
      mediaType: 'image',
    },
  };
}

function readDocumentResult() {
  return {
    success: true,
    data: {
      source: SOURCE,
      mode: 'manifest',
      text: 'bounded text',
      manifest: {
        units: [
          {
            kind: 'page',
            locator: { kind: 'page', pageNumber: 1, pageIndex: 0 },
            title: 'Page 1',
          },
        ],
      },
      cursor: {
        source: { filePath: '${WORKSPACE}/books/book.pdf', format: 'pdf', contentLocator: SOURCE },
        strategy: 'manifest-order',
        next: { kind: 'page', pageNumber: 1, pageIndex: 0 },
        batchIndex: 0,
        done: false,
        maxChars: 20_000,
      },
      imageInfo: [
        {
          alias: 'page-1',
          width: 1200,
          height: 1600,
          mimeType: 'image/png',
          contentLocator: IMAGE,
        },
      ],
      imageCount: 1,
      imagesTruncated: false,
    },
  } as const;
}

function generatedImageResult(message = 'generated') {
  return {
    success: true,
    data: {
      message,
      outputs: [{ type: 'image', contentLocator: GENERATED_IMAGE }],
    },
    attachments: [{ type: 'image' as const, contentLocator: GENERATED_IMAGE }],
  };
}

function searchResult() {
  return {
    success: true,
    data: {
      query: {
        text: 'library-image',
        projectRoot: '/Users/example/private-workspace',
        contextFilePath: '/Users/example/private-workspace/secret.txt',
      },
      itemCount: 1,
      items: [
        {
          id: 'media-library:image',
          kind: 'media',
          label: 'library-image.png',
          freshness: 'fresh',
          source: {
            partition: 'media-library',
            sourceKind: 'media-library',
            contentLocator: {
              kind: 'media-library',
              libraryName: 'Reference',
              relativePath: 'library-image.png',
            },
          },
        },
      ],
    },
  } as const;
}

function directoryResult() {
  const entry = (name: string, size: number) => ({
    name,
    type: 'file',
    size,
    contentLocator: { kind: 'workspace-file' as const, path: `materials/${name}` },
  });
  return {
    success: true,
    data: {
      directoryPath: 'materials',
      absolutePath: '/Users/example/private-workspace/materials',
      entries: [
        entry('notes.md', 100),
        entry('book.epub', 200),
        entry('cover.png', 300),
        entry('theme.mp3', 400),
        entry('workspace.nkc', 500),
        entry('source.zip', 600),
        {
          name: 'escaped.txt',
          type: 'file',
          size: 700,
          contentLocator: { kind: 'workspace-file' as const, path: 'private/escaped.txt' },
        },
      ],
      totalEntries: 7,
      truncated: true,
      nextCursor: { directoryPath: 'materials', after: 'workspace.nkc' },
    },
  } as const;
}

function persistedDirectoryEntry(): SessionTreeEntry {
  return {
    type: 'message',
    id: 'directory-result-1',
    parentId: null,
    timestamp: '2026-08-09T00:00:03.000Z',
    message: {
      role: 'toolResult',
      toolCallId: 'call-directory-1',
      toolName: 'ListDirectory',
      content: [{ type: 'text', text: 'bounded directory result' }],
      details: directoryResult(),
      isError: false,
      timestamp: 3,
    },
  };
}

function persistedGeneratedImageEntry(): SessionTreeEntry {
  return {
    type: 'message',
    id: 'generated-result-1',
    parentId: null,
    timestamp: '2026-08-09T00:00:02.000Z',
    message: {
      role: 'toolResult',
      toolCallId: 'call-generate-1',
      toolName: TOOL_NAMES_MEDIA.GENERATE_IMAGE,
      content: [{ type: 'text', text: 'generated' }],
      details: generatedImageResult(),
      isError: false,
      timestamp: 2,
    },
  };
}

function persistedEntries(): readonly SessionTreeEntry[] {
  return [
    {
      type: 'custom',
      id: 'presentation-1',
      parentId: null,
      timestamp: '2026-08-09T00:00:00.000Z',
      customType: 'openneko.user-message-presentation',
      data: {
        turnId: 'turn-1',
        content: 'Read the book',
        contextReferences: [
          {
            type: 'file',
            id: 'file:book.pdf',
            label: 'book.pdf',
            summary: 'Book',
            mediaType: 'document',
            contentLocator: SOURCE,
          },
        ],
      },
    },
    {
      type: 'message',
      id: 'tool-result-1',
      parentId: 'presentation-1',
      timestamp: '2026-08-09T00:00:01.000Z',
      message: {
        role: 'toolResult',
        toolCallId: 'call-1',
        toolName: TOOL_NAMES_SYSTEM.READ_DOCUMENT,
        content: [{ type: 'text', text: 'bounded result' }],
        details: readDocumentResult(),
        isError: false,
        timestamp: 1,
      },
    },
  ];
}

function tool(name: string): Tool {
  return {
    name,
    description: name,
    category: 'analysis',
    parameters: { type: 'object', properties: {} },
    execute: async () => ({ success: true }),
  };
}

function context(conversationId: string): PiCapabilityToolContext {
  return {
    identity: {
      workspaceId: 'workspace-1',
      conversationId,
      branchId: 'main',
      turnId: 'turn-1',
      runId: 'run-1',
      toolCallId: 'call-1',
    },
    workspaceTrusted: true,
  };
}

function requireText(value: string | undefined): string {
  if (!value) throw new Error('Expected projected model text.');
  return value;
}
