/**
 * MarkdownRenderer - Agent text Markdown renderer.
 *
 * Streamdown 2.5.0 is the only production renderer for streaming and final
 * Agent text. @neko/markdown supplies only the narrow extension plugins and
 * projection components consumed below; it does not own Agent streaming
 * lifecycle.
 */

import { Component, memo, useMemo, type ComponentProps, type ReactNode } from 'react';
import {
  defaultRehypePlugins,
  defaultRemarkPlugins,
  Streamdown,
  type Components,
} from 'streamdown';
import {
  createNekoMarkdownRemarkPlugins,
  createNekoMarkdownUrlTransform,
  nekoMarkdownResourceImageRehypePlugin,
  NekoMarkdownMention,
  NekoMarkdownResourceImage,
  NekoMarkdownResourceReference,
  type NekoMarkdownStreamdownComponentProps,
} from '@neko/markdown/streamdown';
import type { MarkdownResourceRenderingProjection } from '../../../presenters/markdown-resource-rendering-presenter';
import { getLogger } from '../../../utils/logger';
import { t } from '../../../i18n';

const logger = getLogger('MarkdownRenderer');

interface StreamdownSanitizeSchema {
  readonly tagNames?: readonly string[];
  readonly attributes?: Readonly<Record<string, readonly unknown[] | undefined>>;
}

function createNekoSanitizePlugin(): unknown {
  const sanitizeDefinition = defaultRehypePlugins.sanitize;
  if (!Array.isArray(sanitizeDefinition) || sanitizeDefinition.length !== 2) {
    throw new Error('Streamdown sanitize plugin contract is unavailable.');
  }
  const [sanitizePlugin, schema] = sanitizeDefinition as unknown as [
    unknown,
    StreamdownSanitizeSchema,
  ];
  return [
    sanitizePlugin,
    {
      ...schema,
      tagNames: [...(schema.tagNames ?? []), 'neko-mention', 'neko-resource-reference'],
      attributes: {
        ...schema.attributes,
        'neko-mention': ['data-neko-mention', 'data-neko-label', 'data-neko-raw'],
        'neko-resource-reference': [
          'data-neko-resource-reference',
          'data-neko-resource-reference-embed',
          'data-neko-resource-reference-target',
          'data-neko-resource-reference-lookup-token',
          'data-neko-raw',
        ],
      },
    },
  ];
}

interface MarkdownRendererProps {
  readonly content: string;
  readonly isStreaming?: boolean;
  readonly className?: string;
  readonly markdownResources?: MarkdownResourceRenderingProjection;
}

function MarkdownRendererContent({
  content,
  isStreaming = false,
  className,
  markdownResources,
}: MarkdownRendererProps): ReactNode {
  const nekoRemarkPlugins = useMemo(() => createNekoMarkdownRemarkPlugins(), []);
  const sanitizePlugin = useMemo(() => createNekoSanitizePlugin(), []);
  const remarkPlugins = useMemo(
    () =>
      [
        defaultRemarkPlugins.gfm,
        defaultRemarkPlugins.codeMeta,
        ...nekoRemarkPlugins,
      ] as unknown as NonNullable<ComponentProps<typeof Streamdown>['remarkPlugins']>,
    [nekoRemarkPlugins],
  );

  const authorizedResourceUris = useMemo(
    () =>
      new Set(
        (markdownResources?.tokens ?? []).flatMap((token) =>
          token.renderUris.length > 0 ? token.renderUris : [],
        ),
      ),
    [markdownResources],
  );
  const resourceImageSources = useMemo(
    () =>
      (markdownResources?.tokens ?? []).flatMap((token) =>
        token.renderUris.length > 0 ? [[token.token, token.renderUris[0]] as const] : [],
      ),
    [markdownResources],
  );
  const rehypePlugins = useMemo(
    () =>
      [
        defaultRehypePlugins.raw,
        sanitizePlugin,
        [nekoMarkdownResourceImageRehypePlugin, { authorizedImageSources: resourceImageSources }],
        defaultRehypePlugins.harden,
      ] as unknown as NonNullable<ComponentProps<typeof Streamdown>['rehypePlugins']>,
    [resourceImageSources, sanitizePlugin],
  );
  const urlTransform = useMemo(
    () => createNekoMarkdownUrlTransform({ authorizedResourceUris }),
    [authorizedResourceUris],
  );

  const components = useMemo<Components>(
    () =>
      ({
        'neko-mention': (props: NekoMarkdownStreamdownComponentProps) => (
          <NekoMarkdownMention {...props} resources={markdownResources} />
        ),
        'neko-resource-reference': (props: NekoMarkdownStreamdownComponentProps) => (
          <NekoMarkdownResourceReference {...props} resources={markdownResources} />
        ),
        img: (props: NekoMarkdownStreamdownComponentProps) => (
          <NekoMarkdownResourceImage {...props} resources={markdownResources} />
        ),
      }) as unknown as Components,
    [markdownResources],
  );

  return (
    <div
      className={`markdown-content min-w-0 max-w-full overflow-hidden text-[13px] leading-relaxed break-words ${className || ''}`}
      data-markdown-renderer="streamdown"
    >
      <Streamdown
        mode={isStreaming ? 'streaming' : 'static'}
        caret="block"
        controls={false}
        components={components}
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        urlTransform={urlTransform}
      >
        {content}
      </Streamdown>
    </div>
  );
}

interface MarkdownBlockErrorBoundaryState {
  readonly error: Error | null;
  readonly content: string;
}

class MarkdownBlockErrorBoundary extends Component<
  { readonly content: string; readonly children: ReactNode },
  MarkdownBlockErrorBoundaryState
> {
  override state: MarkdownBlockErrorBoundaryState = {
    error: null,
    content: this.props.content,
  };

  static getDerivedStateFromProps(
    props: { readonly content: string },
    state: MarkdownBlockErrorBoundaryState,
  ): MarkdownBlockErrorBoundaryState | null {
    return props.content === state.content ? null : { error: null, content: props.content };
  }

  static getDerivedStateFromError(error: Error): Pick<MarkdownBlockErrorBoundaryState, 'error'> {
    return { error };
  }

  override componentDidCatch(error: Error): void {
    logger.error('Block-local presentation failure', error);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          className="rounded border border-[var(--neko-inputValidation-errorBorder)] bg-[var(--neko-inputValidation-errorBackground)] px-2 py-1.5 text-[11px] text-[var(--neko-inputValidation-errorForeground)]"
          data-markdown-block-error="true"
          role="alert"
        >
          <div>{t('chat.markdown.presentation.failed')}</div>
          <details>
            <summary>{t('chat.markdown.presentation.details')}</summary>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px]">
              {this.state.error.message}
            </pre>
          </details>
          <details>
            <summary>{t('chat.markdown.presentation.source')}</summary>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px]">
              {this.props.content}
            </pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

function MarkdownRendererComponent(props: MarkdownRendererProps): ReactNode {
  return (
    <MarkdownBlockErrorBoundary content={props.content}>
      <MarkdownRendererContent {...props} />
    </MarkdownBlockErrorBoundary>
  );
}

// Memoize to prevent unnecessary re-renders during streaming.
export const MarkdownRenderer = memo(MarkdownRendererComponent);
