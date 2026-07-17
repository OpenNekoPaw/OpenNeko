import React, { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Box, Text } from 'ink';
import {
  TerminalMarkdownController,
  type TerminalMarkdownControllerSnapshot,
} from '../../markdown/controller';
import { createFatalMarkdownPresentation } from '../../markdown/diagnostic-presentation';
import { useAgentTerminalPresentation } from '../../presentation/react-context';
import {
  createTerminalMarkdownMessages,
  type TerminalMarkdownMessages,
} from '../../presentation/terminal-label-presentation';
import { encodeTerminalSegments } from '../../markdown/safe-encoding';
import { createTerminalMarkdownThemeResolver } from '../../markdown/theme';
import type { TerminalLine } from '../../markdown/terminal-blocks';
import { useTuiUIStore as useUIStore } from '../../runtime/tui-runtime-context';
import { tokens } from '../../theme/tokens';
import { detectCapabilities, type TerminalCapabilities } from '../../utils/terminal';

export interface CanonicalMarkdownRendererProps {
  readonly sessionKey: string;
  readonly source: string;
  readonly isFinal: boolean;
}

export function CanonicalMarkdownRenderer({
  sessionKey,
  source,
  isFinal,
}: CanonicalMarkdownRendererProps): React.JSX.Element {
  const width = Math.max(
    1,
    useUIStore((state) => state.terminalSize.columns),
  );
  const presentation = useAgentTerminalPresentation();
  const labels = useMemo(() => createTerminalMarkdownMessages(presentation), [presentation]);
  const capabilities = detectCapabilities();
  const [fatalDetail, setFatalDetail] = useState<string | undefined>(undefined);
  const controller = useMemo(
    () =>
      new TerminalMarkdownController({
        key: sessionKey,
        source,
        isFinal,
        viewportWidth: width,
        supportsUnicode: capabilities.supportsUnicode,
        labels,
      }),
    // The session key is the canonical lifecycle boundary. Source/width changes are updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionKey],
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useLayoutEffect(() => {
    try {
      controller.updateSource(source, isFinal);
      controller.requestViewport(width, capabilities.supportsUnicode);
      setFatalDetail(undefined);
    } catch (error) {
      setFatalDetail(error instanceof Error ? error.message : String(error));
    }
  }, [capabilities.supportsUnicode, controller, isFinal, source, width]);

  useEffect(() => () => controller.dispose(), [controller]);

  if (fatalDetail !== undefined) return <FatalMarkdownBlock detail={fatalDetail} labels={labels} />;
  if (snapshot.result.status === 'failed') {
    return (
      <FatalMarkdownBlock
        detail={snapshot.result.diagnostics.map((item) => item.code).join(', ')}
        labels={labels}
      />
    );
  }
  if (snapshot.layout === undefined) {
    return (
      <FatalMarkdownBlock detail="Canonical Markdown layout is unavailable." labels={labels} />
    );
  }

  return <TerminalMarkdownLayoutView snapshot={snapshot} capabilities={capabilities} />;
}

function TerminalMarkdownLayoutView({
  snapshot,
  capabilities,
}: {
  readonly snapshot: TerminalMarkdownControllerSnapshot;
  readonly capabilities: TerminalCapabilities;
}): React.JSX.Element {
  const resolver = createTerminalMarkdownThemeResolver(tokens, capabilities);
  const layout = snapshot.layout;
  if (layout === undefined) throw new Error('Terminal Markdown layout view requires a layout.');
  return (
    <Box flexDirection="column">
      {layout.lines.map((line, index) => (
        <TerminalLineView
          key={`${index}:${line.logicalLine ?? 0}:${line.fragmentIndex ?? 0}`}
          line={line}
          capabilities={capabilities}
          resolver={resolver}
        />
      ))}
    </Box>
  );
}

function TerminalLineView({
  line,
  capabilities,
  resolver,
}: {
  readonly line: TerminalLine;
  readonly capabilities: TerminalCapabilities;
  readonly resolver: ReturnType<typeof createTerminalMarkdownThemeResolver>;
}): React.JSX.Element {
  if (line.kind === 'blank') return <Text> </Text>;
  const encoded = encodeTerminalSegments(line.segments, resolver, capabilities);
  return <Text>{encoded.text}</Text>;
}

function FatalMarkdownBlock({
  detail,
  labels,
}: {
  readonly detail: string;
  readonly labels: TerminalMarkdownMessages;
}): React.JSX.Element {
  const presentation = createFatalMarkdownPresentation(detail, labels);
  return (
    <Box borderStyle="round" borderColor="red" paddingX={1} flexDirection="column">
      <Text>{presentation.segments.map((segment) => segment.text).join('')}</Text>
    </Box>
  );
}
