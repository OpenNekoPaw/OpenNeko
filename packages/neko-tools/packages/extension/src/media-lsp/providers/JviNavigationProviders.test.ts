import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMediaWorkspaceIndex } from '../services/types';
import { JviDefinitionProvider } from './JviDefinitionProvider';
import { JviReferenceProvider } from './JviReferenceProvider';

const vscodeMock = vi.hoisted(() => {
  class Position {
    constructor(
      public readonly line: number,
      public readonly character: number,
    ) {}
  }

  class Range {
    constructor(
      public readonly start: Position,
      public readonly end: Position,
    ) {}
  }

  class Location {
    constructor(
      public readonly uri: { fsPath: string; toString(): string },
      public readonly range: Range,
    ) {}
  }

  function createUri(value: string): { fsPath: string; toString(): string } {
    return {
      fsPath: value.replace(/^file:\/\//, ''),
      toString: () => value,
    };
  }

  return {
    Position,
    Range,
    Location,
    createUri,
  };
});

vi.mock('vscode', () => ({
  Position: vscodeMock.Position,
  Range: vscodeMock.Range,
  Location: vscodeMock.Location,
  Uri: {
    file: vi.fn((fsPath: string) => ({
      fsPath,
      toString: () => `file://${fsPath}`,
    })),
    parse: vi.fn((value: string) => vscodeMock.createUri(value)),
  },
}));

function createWorkspaceIndex(): IMediaWorkspaceIndex {
  return {
    ensureInitialized: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    getDocument: vi.fn(),
    findMediaReferences: vi.fn().mockReturnValue([]),
    findElementById: vi.fn(),
    searchSymbols: vi.fn().mockReturnValue([]),
  };
}

function createDocument(text: string, offset: number) {
  return {
    getText: () => text,
    offsetAt: vi.fn().mockReturnValue(offset),
    uri: vscodeMock.createUri('file:///workspace/project.nkv'),
  };
}

describe('Jvi navigation providers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('definition provider should await workspace index initialization before cross-file lookup', async () => {
    const text = `{
  "tracks": [
    {
      "elements": [
        {
          "Audio": {
            "id": "clip-1",
            "linked_audio_id": "clip-2"
          }
        }
      ]
    }
  ]
}`;
    const offset = text.indexOf('"clip-2"') + 2;
    const workspaceIndex = createWorkspaceIndex();
    workspaceIndex.findElementById = vi.fn().mockReturnValue({
      jviUri: 'file:///workspace/other.nkv',
      element: {
        id: 'clip-2',
        name: '',
        type: 'audio',
        duration: 0,
        startTime: 0,
        range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
        idRange: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
      },
      range: { startLine: 3, startChar: 12, endLine: 3, endChar: 20 },
    });

    const provider = new JviDefinitionProvider(workspaceIndex);
    const location = await provider.provideDefinition(
      createDocument(text, offset) as never,
      new vscodeMock.Position(0, 0) as never,
      {} as never,
    );

    expect(workspaceIndex.ensureInitialized).toHaveBeenCalledTimes(1);
    expect(workspaceIndex.findElementById).toHaveBeenCalledWith('clip-2');
    expect(location).toBeInstanceOf(vscodeMock.Location);
    expect((location as InstanceType<typeof vscodeMock.Location>).uri.toString()).toBe(
      'file:///workspace/other.nkv',
    );
  });

  it('reference provider should await workspace index initialization before resolving references', async () => {
    const text = `{
  "tracks": [
    {
      "elements": [
        {
          "Media": {
            "id": "clip-1",
            "src": "assets/demo.mp4"
          }
        }
      ]
    }
  ]
}`;
    const offset = text.indexOf('"assets/demo.mp4"') + 2;
    const workspaceIndex = createWorkspaceIndex();
    workspaceIndex.findMediaReferences = vi.fn().mockReturnValue([
      {
        absolutePath: '/workspace/assets/demo.mp4',
        relativeSrc: 'assets/demo.mp4',
        jviUri: 'file:///workspace/project.nkv',
        elementId: 'clip-1',
        srcRange: { startLine: 6, startChar: 19, endLine: 6, endChar: 36 },
      },
    ]);

    const provider = new JviReferenceProvider(workspaceIndex);
    const locations = await provider.provideReferences(
      createDocument(text, offset) as never,
      new vscodeMock.Position(0, 0) as never,
      {} as never,
      {} as never,
    );

    expect(workspaceIndex.ensureInitialized).toHaveBeenCalledTimes(1);
    expect(workspaceIndex.findMediaReferences).toHaveBeenCalledWith('/workspace/assets/demo.mp4');
    expect(locations).toHaveLength(1);
    expect((locations?.[0] as InstanceType<typeof vscodeMock.Location>).uri.toString()).toBe(
      'file:///workspace/project.nkv',
    );
  });
});
