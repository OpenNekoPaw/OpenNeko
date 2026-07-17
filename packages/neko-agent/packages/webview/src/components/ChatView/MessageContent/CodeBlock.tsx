/**
 * CodeBlock - 代码块组件
 * 支持语法高亮和复制按钮
 */

import { useState, useCallback, useSyncExternalStore } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import { getLogger } from '../../../utils/logger';

function getIsLightTheme(): boolean {
  const kind = document.body.dataset.vscodeThemeKind;
  return kind === 'vscode-light' || kind === 'vscode-high-contrast-light';
}

function subscribeToThemeChange(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-vscode-theme-kind'],
  });
  return () => observer.disconnect();
}

function useIsLightTheme(): boolean {
  return useSyncExternalStore(subscribeToThemeChange, getIsLightTheme);
}

const logger = getLogger('CodeBlock');

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
}

const WRAPPING_LANGUAGE_IDS = new Set(['text', 'txt', 'plain', 'plaintext', 'prompt', 'markdown']);

export function shouldWrapCodeBlockLanguage(language?: string): boolean {
  return WRAPPING_LANGUAGE_IDS.has((language || 'text').toLowerCase());
}

export function CodeBlock({ code, language = 'text', showLineNumbers = false }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const isLight = useIsLightTheme();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error('Failed to copy code:', err);
    }
  }, [code]);

  // Normalize language name
  const normalizedLanguage = language?.toLowerCase() || 'text';
  const highlightTheme = isLight ? themes.vsLight : themes.vsDark;
  const shouldWrap = !showLineNumbers && shouldWrapCodeBlockLanguage(normalizedLanguage);

  return (
    <div className="relative group my-2 rounded-md overflow-hidden border border-[var(--vscode-panel-border)] w-full max-w-full min-w-0">
      {/* Header with language and copy button */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[var(--vscode-titleBar-activeBackground)] border-b border-[var(--vscode-panel-border)] min-w-0">
        <span className="min-w-0 truncate text-[10px] text-[var(--vscode-descriptionForeground)] uppercase font-medium">
          {normalizedLanguage}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-foreground)] transition-colors"
          title={copied ? 'Copied!' : 'Copy code'}
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

      {/* Code content with syntax highlighting */}
      <Highlight theme={highlightTheme} code={code.trim()} language={normalizedLanguage}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={`${className} ${
              shouldWrap ? 'overflow-x-hidden whitespace-pre-wrap break-words' : 'overflow-x-auto'
            } p-3 m-0 text-[12px] leading-relaxed w-full max-w-full min-w-0`}
            style={{
              ...style,
              backgroundColor: 'var(--vscode-editor-background)',
              margin: 0,
            }}
          >
            {tokens.map((line, i) => (
              <div
                key={i}
                {...getLineProps({ line })}
                className={showLineNumbers ? 'table-row' : 'block min-w-0'}
              >
                {showLineNumbers && (
                  <span className="table-cell pr-4 text-right select-none text-[var(--vscode-editorLineNumber-foreground)] opacity-50">
                    {i + 1}
                  </span>
                )}
                <span className={showLineNumbers ? 'table-cell' : undefined}>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </span>
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

// Copy icon
function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

// Check icon
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}
