import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface RenderLifecycleOwnerInventoryItem {
  readonly concern:
    | 'visible-react-state'
    | 'foreground-refs'
    | 'conversation-cache'
    | 'projection-attachment'
    | 'markdown-registry'
    | 'viewport-focus'
    | 'extension-activation';
  readonly currentOwner: string;
  readonly lifecycleScope: 'component' | 'conversation' | 'tab' | 'extension-message';
  readonly writableFromBackground: boolean;
}

const currentRenderLifecycleOwners: readonly RenderLifecycleOwnerInventoryItem[] = [
  {
    concern: 'visible-react-state',
    currentOwner: 'useConversationState active output projection',
    lifecycleScope: 'component',
    writableFromBackground: false,
  },
  {
    concern: 'foreground-refs',
    currentOwner: 'useConversationState active output projection',
    lifecycleScope: 'component',
    writableFromBackground: false,
  },
  {
    concern: 'conversation-cache',
    currentOwner: 'ConversationRenderCoordinator with state projection adapter',
    lifecycleScope: 'conversation',
    writableFromBackground: true,
  },
  {
    concern: 'projection-attachment',
    currentOwner: 'per-Tab ProjectionAttachmentClient',
    lifecycleScope: 'tab',
    writableFromBackground: true,
  },
  {
    concern: 'markdown-registry',
    currentOwner: 'per-Tab AgentMarkdownSessionRegistry',
    lifecycleScope: 'tab',
    writableFromBackground: true,
  },
  {
    concern: 'viewport-focus',
    currentOwner: 'ConversationRenderSnapshot viewport intent',
    lifecycleScope: 'conversation',
    writableFromBackground: false,
  },
  {
    concern: 'extension-activation',
    currentOwner: 'ConversationRenderCoordinator activation transaction',
    lifecycleScope: 'extension-message',
    writableFromBackground: false,
  },
];

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const stateProjectionAdapterPath = 'render-lifecycle/conversation-render-state-adapter.ts';

describe('current conversation render lifecycle ownership', () => {
  it('keeps every known render concern explicit after coordinator convergence', () => {
    expect(currentRenderLifecycleOwners.map(({ concern }) => concern)).toEqual([
      'visible-react-state',
      'foreground-refs',
      'conversation-cache',
      'projection-attachment',
      'markdown-registry',
      'viewport-focus',
      'extension-activation',
    ]);
  });

  it('allows background writes only to conversation-owned or derived renderer resources', () => {
    expect(
      currentRenderLifecycleOwners
        .filter(({ writableFromBackground }) => writableFromBackground)
        .map(({ concern }) => concern),
    ).toEqual(['conversation-cache', 'projection-attachment', 'markdown-registry']);
  });

  it('keeps migrated conversation projections writable only through the state adapter', () => {
    const directProjectionMutation =
      /conversation(?:Messages|Streaming)Ref\.current\.(?:set|delete|clear)\(/;
    const mutationOwners = collectProductionSourceFiles(srcRoot).filter((relativePath) =>
      directProjectionMutation.test(readFileSync(join(srcRoot, relativePath), 'utf8')),
    );

    expect(mutationOwners).toEqual([stateProjectionAdapterPath]);
  });

  it('removes foreground activation adapters from the canonical render path', () => {
    const productionFiles = [
      'components/ConversationController.tsx',
      'handlers/conversation-handlers.ts',
      'handlers/conversation-tab-session-state.ts',
      'handlers/tab-handlers.ts',
      stateProjectionAdapterPath,
    ] as const;
    const prepareActivationCallers = productionFiles.filter((relativePath) =>
      readFileSync(join(srcRoot, relativePath), 'utf8').includes('.prepareActivation('),
    );

    expect(prepareActivationCallers).toEqual([]);
    expect(existsSync(join(srcRoot, 'presenters/conversation-tab-activation-presenter.ts'))).toBe(
      false,
    );
    expect(
      existsSync(join(srcRoot, 'render-lifecycle/legacy-conversation-render-adapter.ts')),
    ).toBe(false);
    expect(existsSync(join(srcRoot, 'hooks/useUIState.ts'))).toBe(false);
  });
});

function collectProductionSourceFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') visit(absolutePath);
        continue;
      }
      if (
        !entry.isFile() ||
        !/\.(?:ts|tsx)$/.test(entry.name) ||
        /\.test\.(?:ts|tsx)$/.test(entry.name)
      ) {
        continue;
      }
      files.push(absolutePath.slice(root.length + 1));
    }
  };

  visit(root);
  return files.sort();
}
