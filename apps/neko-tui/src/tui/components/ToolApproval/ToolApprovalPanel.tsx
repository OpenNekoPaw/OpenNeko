/**
 * ToolApprovalPanel Component
 *
 * Shows tool call details and waits for user approval.
 * Keyboard: y=approve, n=reject, a=always allow.
 *
 * Renders context-aware previews:
 * - File write/edit tools → DiffPreview
 * - Bash/shell tools → CommandPreview
 * - Other tools → argument summary
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { PendingApproval } from '../../stores/ui-store';
import { tokens } from '../../theme/tokens';
import { useAgentTerminalPresentation } from '../../presentation/react-context';
import { DiffPreview } from './DiffPreview';
import { CommandPreview } from './CommandPreview';

/** Tools that modify files — show diff preview */
const FILE_TOOLS = new Set([
  'write_file',
  'edit_file',
  'create_file',
  'patch_file',
  'WriteFile',
  'EditFile',
  'CreateFile',
]);

/** Tools that execute commands — show command preview */
const SHELL_TOOLS = new Set([
  'bash',
  'execute_command',
  'run_command',
  'shell',
  'Bash',
  'ExecuteCommand',
  'RunCommand',
]);

interface ToolApprovalPanelProps {
  readonly approval: PendingApproval;
  readonly onApprove: () => void;
  readonly onReject: () => void;
}

export function ToolApprovalPanel({
  approval,
  onApprove,
  onReject,
}: ToolApprovalPanelProps): React.JSX.Element {
  const presentation = useAgentTerminalPresentation();

  useInput((input) => {
    if (input === 'y' || input === 'Y' || input === 'a' || input === 'A') {
      onApprove();
    } else if (input === 'n' || input === 'N') {
      onReject();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={tokens.approval.border}
      paddingLeft={1}
      paddingRight={1}
      marginTop={1}
    >
      {/* Header */}
      <Text bold color={tokens.warning}>
        {presentation.t('agent.terminal.approval.required')}
      </Text>

      {/* Tool name */}
      <Box marginTop={1}>
        <Text>
          <Text bold>{approval.toolName}</Text>
        </Text>
      </Box>

      {/* Context-aware preview */}
      <Box marginTop={1}>
        <ToolPreview name={approval.toolName} args={approval.arguments} />
      </Box>

      {/* Keyboard shortcuts */}
      <Box marginTop={1}>
        <Text>
          <Text color={tokens.approval.approve} bold>
            [y]
          </Text>
          <Text>{presentation.t('agent.terminal.approval.yes')} </Text>
          <Text color={tokens.approval.reject} bold>
            [n]
          </Text>
          <Text>{presentation.t('agent.terminal.approval.no')} </Text>
          <Text color={tokens.info} bold>
            [a]
          </Text>
          <Text>{presentation.t('agent.terminal.approval.always')}</Text>
        </Text>
      </Box>
    </Box>
  );
}

/** Render appropriate preview based on tool type */
function ToolPreview({
  name,
  args,
}: {
  readonly name: string;
  readonly args: Record<string, unknown>;
}): React.JSX.Element {
  // File tools → diff preview
  if (FILE_TOOLS.has(name)) {
    const oldContent = typeof args['old_content'] === 'string' ? args['old_content'] : '';
    const newContent =
      typeof args['new_content'] === 'string'
        ? args['new_content']
        : typeof args['content'] === 'string'
          ? args['content']
          : '';
    const filePath =
      typeof args['path'] === 'string'
        ? args['path']
        : typeof args['file_path'] === 'string'
          ? args['file_path']
          : undefined;

    if (newContent) {
      return <DiffPreview oldContent={oldContent} newContent={newContent} filePath={filePath} />;
    }
  }

  // Shell tools → command preview
  if (SHELL_TOOLS.has(name)) {
    const command =
      typeof args['command'] === 'string'
        ? args['command']
        : typeof args['cmd'] === 'string'
          ? args['cmd']
          : '';
    const cwd = typeof args['cwd'] === 'string' ? args['cwd'] : undefined;

    if (command) {
      return <CommandPreview command={command} cwd={cwd} />;
    }
  }

  // Default → argument summary
  return <Text dimColor>{summarizeToolArgs(args)}</Text>;
}

function summarizeToolArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
    .slice(0, 4)
    .map(([k, v]) => `${k}=${truncate(String(v), 50)}`);
  return entries.join('\n');
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
