import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import React, { useEffect } from 'react';
import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isCanonicalConversationId } from '@neko/agent';
import type { IService } from '@neko/shared';
import { DEFAULT_CLI_CONFIG, type CLIConfig } from '../../core/types';
import { useAgentSession } from '../useAgentSession';
import { createTestAgentTerminalPresentation } from '../../presentation/testing';
import { createTuiConversationId } from '../../core/tui-conversation-id';
import {
  createTuiTestRuntime,
  type TuiTestRuntime,
} from '../../__tests__/render-with-presentation';
import { TuiApplicationRuntimeProvider } from '../../runtime/tui-runtime-context';
import { createMemoryLocalMetadataBinding } from '../../host/__tests__/fixtures/memory-local-metadata';

let tempRoot: string;
let runtime: TuiTestRuntime;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-tui-session-id-'));
});

afterEach(async () => {
  cleanup();
  await new Promise<void>((resolve) => setImmediate(resolve));
  runtime?.application.dispose();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('useAgentSession conversation identity', () => {
  it('starts new Ink TUI sessions with canonical workspace conversation ids', async () => {
    const conversationIds: string[] = [];
    let sessionReady = false;

    const config = {
      ...DEFAULT_CLI_CONFIG,
      workDir: tempRoot,
      providerRequiresApiKey: false,
    };
    renderSessionProbe(
      React.createElement(ConversationIdProbe, {
        config,
        onConversationId: (conversationId: string) => {
          conversationIds.push(conversationId);
        },
        onReady: () => {
          sessionReady = true;
        },
      }),
      config,
    );

    await waitFor(
      () =>
        sessionReady &&
        conversationIds.some((conversationId) => isCanonicalConversationId(conversationId)),
    );

    expect(conversationIds.every((conversationId) => !conversationId.startsWith('cli-'))).toBe(
      true,
    );
  });

  it('rejects old cli resume ids before loading persisted records', async () => {
    const config = {
      ...DEFAULT_CLI_CONFIG,
      workDir: tempRoot,
      providerRequiresApiKey: false,
    };
    renderSessionProbe(
      React.createElement(ConversationIdProbe, {
        config,
        resumeConversationId: 'cli-kf12oi-4fzzzxjyl',
        onConversationId: () => undefined,
      }),
      config,
      'cli-kf12oi-4fzzzxjyl',
    );

    await waitFor(
      () =>
        runtime.conversation.stores.agent
          .getState()
          .error?.message.includes('TUI 恢复对话 ID 必须是规范 ID') === true,
    );

    expect(runtime.conversation.stores.agent.getState().status).toBe('error');
  });
});

function renderSessionProbe(
  node: React.ReactElement,
  config: CLIConfig,
  conversationId = createTuiConversationId(config.workDir),
): void {
  runtime = createTuiTestRuntime(config, conversationId);
  render(
    React.createElement(TuiApplicationRuntimeProvider, {
      runtime: runtime.application,
      children: node,
    }),
  );
}

function ConversationIdProbe(props: {
  readonly config: CLIConfig;
  readonly resumeConversationId?: string;
  readonly onConversationId: (conversationId: string) => void;
  readonly onReady?: () => void;
}): React.JSX.Element {
  const session = useAgentSession({
    config: props.config,
    presentation: createTestAgentTerminalPresentation('zh-cn'),
    promptLocale: 'zh-cn',
    service: createNoopService(),
    resumeConversationId: props.resumeConversationId,
    createLocalMetadata: createMemoryLocalMetadataBinding,
  });

  useEffect(() => {
    props.onConversationId(session.getCurrentConversationId());
  }, [props, session.getCurrentConversationId]);

  useEffect(() => {
    if (session.isReady) {
      props.onReady?.();
    }
  }, [props.onReady, session.isReady]);

  return React.createElement(Text, null, 'conversation-id-probe');
}

function createNoopService(): IService {
  return {
    async chat() {
      return {
        id: 'noop-response',
        model: 'noop-model',
        message: { role: 'assistant', content: '' },
        finishReason: 'stop',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    },
    async *chatStream() {
      yield { type: 'done' as const };
    },
    async embed(texts: string[]) {
      return { embeddings: texts.map(() => []) };
    },
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for canonical conversation id.');
}
