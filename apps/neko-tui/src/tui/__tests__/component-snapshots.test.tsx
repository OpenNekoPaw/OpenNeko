/**
 * Component Snapshot Tests
 *
 * Uses ink-testing-library to capture TUI layout snapshots.
 * Each test renders a component with specific state and captures lastFrame().
 *
 * This lets us "see" the layout without running the actual TUI program.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render as renderInk } from 'ink-testing-library';
import { Box } from 'ink';

// Components under test (leaf-first — no heavy hooks)
import { MessageItem } from '../components/ChatView/MessageItem';
import { StreamingText } from '../components/ChatView/StreamingText';
import { ThinkingBlock } from '../components/ChatView/ThinkingBlock';
import { TodoList } from '../components/ChatView/TodoList';
import { StatusBar } from '../components/StatusBar/StatusBar';
import { InputEditor } from '../components/Input/InputEditor';
import { ChatView } from '../components/ChatView/ChatView';
import { ToolApprovalPanel } from '../components/ToolApproval/ToolApprovalPanel';

import type { Message, TodoItem } from '../types/state';
import { DEFAULT_CLI_CONFIG } from '../core/types';
import { AgentTerminalPresentationProvider } from '../presentation/react-context';
import { createTestAgentTerminalPresentation } from '../presentation/testing';
import { createTuiTestRuntime, type TuiTestRuntime } from './render-with-presentation';
import { TuiApplicationRuntimeProvider } from '../runtime/tui-runtime-context';

// ─── Helpers ────────────────────────────────────────────────────────

const TEST_PRESENTATION = createTestAgentTerminalPresentation('en');
let runtime: TuiTestRuntime;

function render(node: React.ReactElement): ReturnType<typeof renderInk> {
  return renderInk(
    <TuiApplicationRuntimeProvider runtime={runtime.application}>
      <AgentTerminalPresentationProvider value={TEST_PRESENTATION}>
        {node}
      </AgentTerminalPresentationProvider>
    </TuiApplicationRuntimeProvider>,
  );
}

/** Reset all stores to initial state */
function resetStores(): void {
  runtime = createTuiTestRuntime();
  runtime.conversation.stores.agent.getState().reset();
  runtime.conversation.stores.conversation.getState().clearMessages();
  runtime.conversation.stores.config.getState().replaceConfig({
    ...DEFAULT_CLI_CONFIG,
    model: 'gpt-5.3-codex',
    provider: 'openai',
    providerType: 'openai',
    providerRequiresApiKey: true,
  });
}

/** Create a user message fixture */
function userMsg(content: string): Message {
  return {
    id: `user-${Date.now()}`,
    role: 'user',
    content,
    toolCalls: [],
    todos: [],
    timestamp: Date.now(),
  };
}

/** Create an assistant message fixture */
function assistantMsg(content: string, overrides?: Partial<Message>): Message {
  return {
    id: `asst-${Date.now()}`,
    role: 'assistant',
    content,
    toolCalls: [],
    todos: [],
    timestamp: Date.now(),
    ...overrides,
  };
}

/** Create a system/error message fixture */
function systemMsg(content: string, isError = false): Message {
  return {
    id: `sys-${Date.now()}`,
    role: 'system',
    content,
    toolCalls: [],
    todos: [],
    timestamp: Date.now(),
    isError,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Component Snapshots (ink-testing-library)', () => {
  beforeEach(() => {
    resetStores();
  });

  // ═══════════════════════════════════════════════════════════════════
  // 1. StreamingText — simplest leaf component
  // ═══════════════════════════════════════════════════════════════════

  describe('StreamingText', () => {
    it('renders streaming text with cursor', () => {
      const { lastFrame } = render(
        <StreamingText content="Hello, I'm thinking about" isStreaming={true} />,
      );
      const frame = lastFrame();
      expect(frame).toContain("Hello, I'm thinking about");
      expect(frame).toContain('▋'); // cursor
      console.log('StreamingText (streaming):\n', frame);
    });

    it('renders completed text without cursor', () => {
      const { lastFrame } = render(<StreamingText content="Done." isStreaming={false} />);
      const frame = lastFrame();
      expect(frame).toContain('Done.');
      expect(frame).not.toContain('▋');
      console.log('StreamingText (completed):\n', frame);
    });

    it('renders empty when no content and not streaming', () => {
      const { lastFrame } = render(<StreamingText content="" isStreaming={false} />);
      console.log('StreamingText (empty):\n', lastFrame());
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 2. ThinkingBlock
  // ═══════════════════════════════════════════════════════════════════

  describe('ThinkingBlock', () => {
    it('renders active thinking with spinner', () => {
      const { lastFrame } = render(
        <ThinkingBlock content="Analyzing the code structure..." isThinking={true} />,
      );
      const frame = lastFrame();
      expect(frame).toContain('Thinking...');
      console.log('ThinkingBlock (active):\n', frame);
    });

    it('renders completed thinking with line count and preview', () => {
      const thinkingContent = [
        'First, I need to understand the module structure.',
        'The components use Zustand for state management.',
        'Ink renders React to terminal output.',
        'The architecture follows SOLID principles.',
        'I should check the test utilities.',
      ].join('\n');

      const { lastFrame } = render(
        <ThinkingBlock content={thinkingContent} isThinking={false} maxLines={3} />,
      );
      const frame = lastFrame();
      expect(frame).toContain('Thought for 5 lines');
      expect(frame).toContain('First, I need to understand');
      expect(frame).toContain('... 2 more lines');
      console.log('ThinkingBlock (completed, 5 lines):\n', frame);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 3. TodoList
  // ═══════════════════════════════════════════════════════════════════

  describe('TodoList', () => {
    it('renders mixed todo states', () => {
      const todos: TodoItem[] = [
        { content: 'Read configuration file', status: 'completed' },
        { content: 'Analyzing code structure', status: 'in_progress' },
        { content: 'Generate test cases', status: 'pending' },
        { content: 'Deploy blocked', status: 'blocked' },
      ];

      const { lastFrame } = render(<TodoList todos={todos} />);
      const frame = lastFrame();
      expect(frame).toContain('[✓]');
      expect(frame).toContain('Read configuration file');
      expect(frame).toContain('Analyzing code structure');
      expect(frame).toContain('[ ]');
      expect(frame).toContain('[!]');
      console.log('TodoList (mixed states):\n', frame);
    });

    it('renders empty for no todos', () => {
      const { lastFrame } = render(<TodoList todos={[]} />);
      console.log('TodoList (empty):\n', lastFrame());
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 4. MessageItem — user / assistant / system
  // ═══════════════════════════════════════════════════════════════════

  describe('MessageItem', () => {
    it('renders user message with prompt prefix', () => {
      const msg = userMsg('What is the architecture of neko-suite?');
      const { lastFrame } = render(<MessageItem message={msg} />);
      const frame = lastFrame();
      expect(frame).toContain('❯');
      expect(frame).toContain('What is the architecture of neko-suite?');
      console.log('MessageItem (user):\n', frame);
    });

    it('renders assistant message with markdown content', () => {
      const msg = assistantMsg(
        'The architecture uses **SOLID** principles with `React` and `Ink`.',
      );
      const { lastFrame } = render(<MessageItem message={msg} />);
      const frame = lastFrame();
      expect(frame).toContain('SOLID');
      expect(frame).toContain('React');
      console.log('MessageItem (assistant, markdown):\n', frame);
    });

    it('renders assistant message with tool calls', () => {
      const msg = assistantMsg('', {
        toolCalls: [
          {
            id: 'tc-1',
            name: 'ReadFile',
            arguments: { path: '/src/components/App.tsx' },
            status: 'success',
          },
          {
            id: 'tc-2',
            name: 'Bash',
            arguments: { command: 'pnpm test' },
            status: 'running',
          },
          {
            id: 'tc-3',
            name: 'WriteFile',
            arguments: { path: '/src/new-file.ts' },
            status: 'error',
            error: 'Permission denied',
          },
        ],
      });

      const { lastFrame } = render(<MessageItem message={msg} />);
      const frame = lastFrame();
      expect(frame).toContain('ReadFile');
      expect(frame).toContain('✓');
      expect(frame).toContain('Bash');
      expect(frame).toContain('pnpm test');
      expect(frame).toContain('WriteFile');
      expect(frame).toContain('✗');
      console.log('MessageItem (tool calls):\n', frame);
    });

    it('renders assistant message with thinking + content + todos', () => {
      const msg = assistantMsg('Here is my analysis of the code.', {
        thinking: 'Let me analyze the component tree...\nChecking imports...',
        todos: [
          { content: 'Analyze components', status: 'completed' },
          { content: 'Write tests', status: 'in_progress' },
        ],
      });

      const { lastFrame } = render(<MessageItem message={msg} />);
      const frame = lastFrame();
      expect(frame).toContain('Thought for');
      expect(frame).toContain('Here is my analysis');
      expect(frame).toContain('[✓]');
      expect(frame).toContain('Write tests');
      console.log('MessageItem (full assistant):\n', frame);
    });

    it('renders streaming assistant message content', () => {
      const msg = assistantMsg('');
      const { lastFrame } = render(
        <MessageItem
          message={msg}
          isStreaming={true}
          currentDelta="Let me check the "
          currentThinking=""
        />,
      );
      const frame = lastFrame();
      expect(frame).toContain('Let me check the');
      console.log('MessageItem (streaming):\n', frame);
    });

    it('renders system error message', () => {
      const msg = systemMsg('Error: Connection refused', true);
      const { lastFrame } = render(<MessageItem message={msg} />);
      const frame = lastFrame();
      expect(frame).toContain('Error: Connection refused');
      console.log('MessageItem (system error):\n', frame);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 5. InputEditor
  // ═══════════════════════════════════════════════════════════════════

  describe('InputEditor', () => {
    it('renders empty input with prompt and cursor', () => {
      const { lastFrame } = render(<InputEditor onSubmit={() => {}} />);
      const frame = lastFrame();
      expect(frame).toContain('>');
      expect(frame).not.toContain('/ commands  $ Skills  @ refs');
      expect(frame).toContain('▋');
      console.log('InputEditor (empty, idle):\n', frame);
    });

    it('renders disabled state when agent is running', () => {
      const { lastFrame } = render(<InputEditor onSubmit={() => {}} disabled={true} />);
      const frame = lastFrame();
      console.log('InputEditor (disabled):\n', frame);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 6. StatusBar — depends on stores
  // ═══════════════════════════════════════════════════════════════════

  describe('StatusBar', () => {
    it('renders idle state with model and mode', () => {
      // Stores already reset to idle + auto + gpt-5.3-codex
      const { lastFrame } = render(<StatusBar />);
      const frame = lastFrame();
      expect(frame).toContain('gpt-5.3-codex');
      expect(frame).toContain('auto');
      expect(frame).toContain('agent:auto');
      expect(frame).toContain('media:none');
      expect(frame).toContain('ctx:0/?');
      console.log('StatusBar (idle):\n', frame);
    });

    it('renders running state with spinner', () => {
      runtime.conversation.stores.agent.getState().setRunning();
      runtime.conversation.stores.agent.getState().setIteration(3, 10);
      runtime.conversation.stores.agent.getState().updateUsage({
        inputTokens: 1200,
        outputTokens: 350,
        totalTokens: 1550,
      });

      const { lastFrame } = render(<StatusBar />);
      const frame = lastFrame();
      expect(frame).toContain('gpt-5.3-codex');
      expect(frame).toContain('auto');
      expect(frame).toContain('ctx:1.2K/?');
      expect(frame).not.toContain('3/10');
      console.log('StatusBar (running):\n', frame);
    });

    it('renders error state', () => {
      runtime.conversation.stores.agent.getState().setError(new Error('API timeout'));

      const { lastFrame } = render(<StatusBar />);
      const frame = lastFrame();
      expect(frame).toContain('agent:auto');
      expect(frame).not.toContain('API timeout');
      console.log('StatusBar (error):\n', frame);
    });

    it('renders plan mode', () => {
      runtime.conversation.stores.agent.getState().setExecutionMode('plan');

      const { lastFrame } = render(<StatusBar />);
      const frame = lastFrame();
      expect(frame).toContain('plan');
      console.log('StatusBar (plan mode):\n', frame);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 7. ToolApprovalPanel
  // ═══════════════════════════════════════════════════════════════════

  describe('ToolApprovalPanel', () => {
    it('renders bash command approval', () => {
      const approval = {
        toolCallId: 'tc-1',
        toolName: 'Bash',
        arguments: { command: 'rm -rf node_modules && pnpm install' },
        resolve: () => {},
      };

      const { lastFrame } = render(
        <ToolApprovalPanel approval={approval} onApprove={() => {}} onReject={() => {}} />,
      );
      const frame = lastFrame();
      expect(frame).toContain('Tool Approval Required');
      expect(frame).toContain('Bash');
      expect(frame).toContain('rm -rf node_modules');
      expect(frame).toContain('[y]');
      expect(frame).toContain('[n]');
      expect(frame).toContain('[a]');
      console.log('ToolApprovalPanel (bash):\n', frame);
    });

    it('renders file write approval', () => {
      const approval = {
        toolCallId: 'tc-2',
        toolName: 'WriteFile',
        arguments: {
          path: '/src/index.ts',
          content: 'export const hello = "world";\n',
        },
        resolve: () => {},
      };

      const { lastFrame } = render(
        <ToolApprovalPanel approval={approval} onApprove={() => {}} onReject={() => {}} />,
      );
      const frame = lastFrame();
      expect(frame).toContain('Tool Approval Required');
      expect(frame).toContain('WriteFile');
      console.log('ToolApprovalPanel (write file):\n', frame);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 8. ChatView — full conversation with store state
  // ═══════════════════════════════════════════════════════════════════

  describe('ChatView', () => {
    it('renders empty conversation', () => {
      const { lastFrame } = render(<ChatView />);
      const frame = lastFrame();
      // Empty ChatView should be essentially blank
      console.log('ChatView (empty):\n', frame);
    });

    it('renders multi-turn conversation', () => {
      const store = runtime.conversation.stores.conversation.getState();
      store.addUserMessage('What files are in src/?');
      store.startAssistantMessage();
      store.addToolCall({
        id: 'tc-1',
        name: 'Bash',
        arguments: { command: 'ls src/' },
      });
      store.updateToolResult({
        toolCallId: 'tc-1',
        success: true,
        data: 'App.tsx\nindex.ts\nutils/',
      });
      store.completeMessage('Here are the files in `src/`:\n- App.tsx\n- index.ts\n- utils/');

      store.addUserMessage('Show me App.tsx');
      store.startAssistantMessage();
      store.completeMessage('Here is the content of App.tsx...');

      const { lastFrame } = render(<ChatView />);
      const frame = lastFrame();
      expect(frame).toContain('What files are in src/?');
      expect(frame).toContain('Bash');
      expect(frame).toContain('ls src/');
      expect(frame).toContain('App.tsx');
      expect(frame).toContain('Show me App.tsx');
      console.log('ChatView (multi-turn):\n', frame);
    });

    it('renders conversation with active streaming', () => {
      const store = runtime.conversation.stores.conversation.getState();
      store.addUserMessage('Explain this code');
      store.startAssistantMessage();
      store.setThinking('Let me analyze...');
      store.appendDelta('This code implements a ');

      const { lastFrame } = render(<ChatView />);
      const frame = lastFrame();
      expect(frame).toContain('Explain this code');
      expect(frame).toContain('This code implements a');
      console.log('ChatView (streaming):\n', frame);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 9. Full Layout Snapshot (App without heavy hooks)
  // ═══════════════════════════════════════════════════════════════════

  describe('Full Layout Composition', () => {
    /**
     * We render the key visible components together without the App wrapper
     * to avoid heavy hooks (useAgentSession, useKeyboard).
     * This captures the visual layout structure accurately.
     */
    it('renders idle state full layout', () => {
      runtime.conversation.stores.conversation.getState().addUserMessage('Hello neko!');
      runtime.conversation.stores.conversation.getState().startAssistantMessage();
      runtime.conversation.stores.conversation
        .getState()
        .completeMessage('Hello! How can I help you today?');

      const { lastFrame } = render(
        <Box flexDirection="column" height={24}>
          <ChatView />
          <InputEditor onSubmit={() => {}} />
          <StatusBar />
        </Box>,
      );
      const frame = lastFrame();
      expect(frame).toContain('Hello neko!');
      expect(frame).toContain('Hello! How can I help you');
      expect(frame).toContain('>');
      expect(frame).toContain('gpt-5.3-codex');
      // No INSERT indicator (removed)
      console.log('═══ Full Layout (idle) ═══\n', frame);
    });

    it('renders running state with tool approval', () => {
      // Set up conversation
      runtime.conversation.stores.conversation.getState().addUserMessage('Delete all temp files');
      runtime.conversation.stores.conversation.getState().startAssistantMessage();
      runtime.conversation.stores.conversation.getState().addToolCall({
        id: 'tc-1',
        name: 'Bash',
        arguments: { command: 'rm -rf /tmp/neko-*' },
      });

      // Set agent as running
      runtime.conversation.stores.agent.getState().setRunning();
      runtime.conversation.stores.agent.getState().setIteration(1, 5);

      const approval = {
        toolCallId: 'tc-1',
        toolName: 'Bash',
        arguments: { command: 'rm -rf /tmp/neko-*' },
        resolve: () => {},
      };

      const { lastFrame } = render(
        <Box flexDirection="column" height={24}>
          <ChatView />
          <ToolApprovalPanel approval={approval} onApprove={() => {}} onReject={() => {}} />
          <InputEditor onSubmit={() => {}} disabled={true} />
          <StatusBar />
        </Box>,
      );
      const frame = lastFrame();
      expect(frame).toContain('Delete all temp files');
      expect(frame).toContain('Tool Approval Required');
      expect(frame).toContain('rm -rf /tmp/neko-*');
      expect(frame).toContain('[y]');
      expect(frame).toContain('agent:auto');
      expect(frame).toContain('ctx:0/?');
      console.log('═══ Full Layout (tool approval) ═══\n', frame);
    });

    it('renders multi-message conversation with todos', () => {
      const store = runtime.conversation.stores.conversation.getState();

      // Turn 1
      store.addUserMessage('Refactor the auth module');
      store.startAssistantMessage();
      store.addToolCall({
        id: 'tc-1',
        name: 'ReadFile',
        arguments: { path: '/src/auth/index.ts' },
      });
      store.updateToolResult({ toolCallId: 'tc-1', success: true, data: '...' });
      store.updateTodos([
        { content: 'Read auth module', status: 'completed' },
        { content: 'Identify SOLID violations', status: 'completed' },
        { content: 'Refactor to use interfaces', status: 'in_progress' },
        { content: 'Write tests', status: 'pending' },
      ]);
      store.completeMessage("I've analyzed the auth module. Here's my plan:");

      // Turn 2 — streaming
      store.addUserMessage('Go ahead');
      store.startAssistantMessage();
      store.appendDelta("Starting the refactor. First, I'll extract the ");

      runtime.conversation.stores.agent.getState().setRunning();
      runtime.conversation.stores.agent.getState().updateUsage({
        inputTokens: 5000,
        outputTokens: 1200,
        totalTokens: 6200,
      });

      const { lastFrame } = render(
        <Box flexDirection="column" height={40}>
          <ChatView />
          <InputEditor onSubmit={() => {}} disabled={true} />
          <StatusBar />
        </Box>,
      );
      const frame = lastFrame();
      expect(frame).toContain('Refactor the auth module');
      expect(frame).toContain('ReadFile');
      expect(frame).toContain('[✓]');
      expect(frame).toContain('[ ]');
      expect(frame).toContain('Go ahead');
      expect(frame).toContain('Starting the refactor');
      expect(frame).toContain('Generating');
      expect(frame).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
      expect(frame).toContain('ctx:5.0K/?');
      console.log('═══ Full Layout (multi-turn + todos + streaming) ═══\n', frame);
    });
  });
});
