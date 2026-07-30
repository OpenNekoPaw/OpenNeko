/**
 * MermaidBlock - Mermaid diagram rendering component
 * Renders mermaid diagram from code with VSCode theme support
 * Uses dynamic import to avoid build-time d3 compatibility issues
 *
 * Features:
 * - SVG download and source code copy
 * - Error reporting with AI fix suggestion
 */

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { AgentHostMessages } from '@/messages';
import { useMessageActions } from '../MessageActionsContext';
import { getLogger } from '../../../utils/logger';
import {
  MermaidIcon,
  CopyIcon,
  CheckIcon,
  DownloadIcon,
  LoadingSpinner,
  ErrorIcon,
  RefreshIcon,
  CodeIcon,
} from './icons';

const logger = getLogger('MermaidBlock');

interface MermaidBlockProps {
  code: string;
}

// Generate unique ID for each mermaid diagram
let mermaidId = 0;
const getMermaidId = () => `mermaid-${++mermaidId}-${Date.now()}`;

// Mermaid instance (lazy loaded)
let mermaidInstance: typeof import('mermaid') | null = null;
let mermaidLoading: Promise<typeof import('mermaid')> | null = null;

async function getMermaid() {
  if (mermaidInstance) return mermaidInstance;

  if (!mermaidLoading) {
    mermaidLoading = import('mermaid').then((mod) => {
      mermaidInstance = mod;
      // Initialize mermaid with custom theme for better contrast
      // Using 'base' theme with custom variables for VSCode integration
      mod.default.initialize({
        startOnLoad: false,
        theme: 'base',
        securityLevel: 'loose',
        fontFamily: 'var(--vscode-font-family)',
        // Custom theme variables for high contrast and VSCode integration
        themeVariables: {
          // Background and text colors - high contrast
          primaryColor: '#4fc3f7',
          primaryTextColor: '#1a1a1a',
          primaryBorderColor: '#29b6f6',
          secondaryColor: '#81c784',
          secondaryTextColor: '#1a1a1a',
          secondaryBorderColor: '#66bb6a',
          tertiaryColor: '#fff176',
          tertiaryTextColor: '#1a1a1a',
          tertiaryBorderColor: '#fdd835',
          lineColor: '#90a4ae',
          textColor: '#e0e0e0',
          background: 'transparent',
          mainBkg: '#4fc3f7',
          nodeBorder: '#29b6f6',
          clusterBkg: 'rgba(79, 195, 247, 0.15)',
          clusterBorder: '#4fc3f7',
          defaultLinkColor: '#90a4ae',
          titleColor: '#e0e0e0',
          edgeLabelBackground: '#2d2d2d',
          // Sequence diagram
          actorBkg: '#4fc3f7',
          actorBorder: '#29b6f6',
          actorTextColor: '#1a1a1a',
          actorLineColor: '#90a4ae',
          signalColor: '#90a4ae',
          signalTextColor: '#e0e0e0',
          labelBoxBkgColor: '#4fc3f7',
          labelBoxBorderColor: '#29b6f6',
          labelTextColor: '#1a1a1a',
          loopTextColor: '#e0e0e0',
          noteBkgColor: '#fff176',
          noteTextColor: '#1a1a1a',
          noteBorderColor: '#fdd835',
          activationBkgColor: '#81c784',
          activationBorderColor: '#66bb6a',
          classText: '#1a1a1a',
          labelColor: '#e0e0e0',
          // Git graph
          git0: '#4fc3f7',
          git1: '#81c784',
          git2: '#fff176',
          git3: '#ef9a9a',
          git4: '#ce93d8',
          git5: '#ffcc80',
          git6: '#80deea',
          git7: '#a5d6a7',
          gitBranchLabel0: '#1a1a1a',
          gitBranchLabel1: '#1a1a1a',
          gitBranchLabel2: '#1a1a1a',
          gitBranchLabel3: '#1a1a1a',
          // Pie chart
          pie1: '#4fc3f7',
          pie2: '#81c784',
          pie3: '#fff176',
          pie4: '#ef9a9a',
          pie5: '#ce93d8',
          pie6: '#ffcc80',
          pie7: '#80deea',
          pieStrokeColor: '#1a1a1a',
          pieStrokeWidth: '2px',
          pieOuterStrokeColor: '#1a1a1a',
          pieOuterStrokeWidth: '2px',
          pieOpacity: '0.9',
          pieTitleTextSize: '14px',
          pieTitleTextColor: '#e0e0e0',
          pieSectionTextColor: '#1a1a1a',
          pieSectionTextSize: '12px',
          pieLegendTextColor: '#e0e0e0',
          pieLegendTextSize: '12px',
        },
        flowchart: {
          htmlLabels: true,
          curve: 'basis',
          padding: 15,
          nodeSpacing: 50,
          rankSpacing: 50,
        },
        sequence: {
          diagramMarginX: 10,
          diagramMarginY: 10,
          actorMargin: 50,
          width: 150,
          height: 65,
          boxMargin: 10,
          boxTextMargin: 5,
          noteMargin: 10,
          messageMargin: 35,
        },
      });
      return mod;
    });
  }

  return mermaidLoading;
}

/**
 * Extract helpful error hints from mermaid parse errors
 */
function getErrorHints(error: string, code: string): string[] {
  const hints: string[] = [];

  if (error.includes('PS') || (error.includes('Expecting') && code.includes('('))) {
    hints.push('Parentheses () in text need to be quoted: ["text (with parens)"]');
  }
  if (code.includes('[') && code.includes(']') && (code.includes('(') || code.includes('{'))) {
    hints.push('Special characters inside [] nodes need escaping or quotes');
  }
  if (error.includes('Lexical error') || error.includes('Parse error')) {
    hints.push('Check for unmatched brackets, quotes, or special characters');
  }
  if (code.includes('-->') && code.includes('->')) {
    hints.push('Arrow styles should be consistent (use --> or ->)');
  }

  return hints;
}

function MermaidBlockComponent({ code }: MermaidBlockProps) {
  const { activeConversationId } = useMessageActions();
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isRendering, setIsRendering] = useState(true);
  const [showSource, setShowSource] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const idRef = useRef(getMermaidId());

  // Render mermaid diagram
  useEffect(() => {
    let cancelled = false;

    const renderDiagram = async () => {
      if (!code.trim()) {
        setError('Empty mermaid code');
        setIsRendering(false);
        return;
      }

      try {
        setIsRendering(true);
        setError(null);

        const mermaidModule = await getMermaid();
        const mermaid = mermaidModule.default;

        if (cancelled) return;

        const isValid = await mermaid.parse(code);
        if (!isValid && !cancelled) {
          setError('Invalid mermaid syntax');
          setIsRendering(false);
          return;
        }

        const { svg: renderedSvg } = await mermaid.render(idRef.current, code);

        if (!cancelled) {
          setSvg(renderedSvg);
          setIsRendering(false);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to render diagram';
          setError(message);
          setIsRendering(false);
        }
      }
    };

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [code]);

  // Copy source code
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error('Failed to copy mermaid code:', err);
    }
  }, [code]);

  // Download as SVG — delegate to Extension Host, fall back to browser download
  const handleDownload = useCallback(() => {
    if (!svg) return;

    AgentHostMessages.downloadSvg(svg, 'mermaid-diagram.svg');
  }, [svg]);

  // Send feedback to LLM about the error
  const handleReportError = useCallback(() => {
    if (!error || feedbackSent || !activeConversationId) return;

    const hints = getErrorHints(error, code);
    const feedbackMessage = `The Mermaid diagram you generated has a syntax error and failed to render.

**Error:** ${error}

${hints.length > 0 ? `**Hints:**\n${hints.map((h) => `- ${h}`).join('\n')}\n\n` : ''}**Original code:**
\`\`\`mermaid
${code}
\`\`\`

Please fix the Mermaid syntax. Common issues:
1. Use quotes for text with special characters: \`A["text (with parens)"]\`
2. Escape special characters in node labels
3. Ensure all brackets and quotes are properly matched`;

    AgentHostMessages.mermaidError(error, code, feedbackMessage, activeConversationId);

    setFeedbackSent(true);
  }, [error, code, feedbackSent, activeConversationId]);

  const toggleSource = useCallback(() => {
    setShowSource((prev) => !prev);
  }, []);

  const errorHints = error ? getErrorHints(error, code) : [];

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-[var(--vscode-panel-border)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--vscode-titleBar-activeBackground)] border-b border-[var(--vscode-panel-border)]">
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)] uppercase font-medium flex items-center gap-1.5">
          <MermaidIcon className="w-3.5 h-3.5" />
          Mermaid
          {error && (
            <span className="text-[var(--vscode-errorForeground)] normal-case">· Error</span>
          )}
        </span>
        <div className="flex items-center gap-1">
          {/* Download button */}
          {svg && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-foreground)] transition-colors"
              title="Download SVG"
            >
              <DownloadIcon className="w-3 h-3" />
              <span>SVG</span>
            </button>
          )}
          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-foreground)] transition-colors"
            title={copied ? 'Copied!' : 'Copy source'}
          >
            {copied ? (
              <>
                <CheckIcon className="w-3 h-3" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <CopyIcon className="w-3 h-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Diagram content */}
      <div
        ref={containerRef}
        className="bg-[var(--vscode-editor-background)] min-h-[80px] flex items-center justify-center overflow-x-auto w-full max-w-full"
      >
        {isRendering ? (
          <div className="flex items-center gap-2 text-[var(--vscode-descriptionForeground)] py-6">
            <LoadingSpinner className="w-4 h-4 animate-spin" />
            <span className="text-[12px]">Rendering diagram...</span>
          </div>
        ) : error ? (
          <div className="w-full">
            {/* Error card */}
            <div className="m-3 rounded-lg border border-[var(--vscode-inputValidation-errorBorder)] bg-[color-mix(in_srgb,var(--vscode-inputValidation-errorBackground,#5a1d1d)_30%,transparent)] overflow-hidden">
              {/* Error header */}
              <div className="px-3 py-2 flex items-center gap-2 border-b border-[var(--vscode-inputValidation-errorBorder)] bg-[color-mix(in_srgb,var(--vscode-inputValidation-errorBackground,#5a1d1d)_50%,transparent)]">
                <ErrorIcon className="w-4 h-4 text-[var(--vscode-errorForeground)]" />
                <span className="text-[12px] font-medium text-[var(--vscode-errorForeground)]">
                  Failed to render diagram
                </span>
              </div>

              {/* Error content */}
              <div className="p-3 space-y-3">
                <div className="text-[11px] text-[var(--vscode-foreground)] font-mono bg-[var(--vscode-textCodeBlock-background)] p-2 rounded overflow-x-auto w-full max-w-full break-all">
                  {error}
                </div>

                {errorHints.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] text-[var(--vscode-descriptionForeground)] font-medium uppercase">
                      Possible fixes
                    </div>
                    <ul className="text-[11px] text-[var(--vscode-foreground)] space-y-1">
                      {errorHints.map((hint, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-[var(--vscode-charts-yellow)]">•</span>
                          <span>{hint}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleReportError}
                    disabled={feedbackSent}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded transition-colors ${
                      feedbackSent
                        ? 'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-descriptionForeground)] cursor-default'
                        : 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]'
                    }`}
                    title={feedbackSent ? 'Feedback sent' : 'Ask AI to fix this diagram'}
                  >
                    {feedbackSent ? (
                      <>
                        <CheckIcon className="w-3 h-3" />
                        <span>Feedback Sent</span>
                      </>
                    ) : (
                      <>
                        <RefreshIcon className="w-3 h-3" />
                        <span>Ask AI to Fix</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={toggleSource}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] transition-colors"
                  >
                    <CodeIcon className="w-3 h-3" />
                    <span>{showSource ? 'Hide' : 'Show'} Source</span>
                  </button>
                </div>

                {showSource && (
                  <div className="mt-2">
                    <pre className="p-2 text-[10px] bg-[var(--vscode-textCodeBlock-background)] rounded overflow-x-auto max-h-[200px] text-[var(--vscode-foreground)] w-full max-w-full">
                      <code>{code}</code>
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="mermaid-diagram p-4" dangerouslySetInnerHTML={{ __html: svg }} />
        )}
      </div>
    </div>
  );
}

export const MermaidBlock = memo(MermaidBlockComponent);
