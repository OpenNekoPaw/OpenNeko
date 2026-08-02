import { Fragment, useMemo, type ReactElement, type ReactNode } from 'react';
import { parseNormalizedMarkdown, type MarkdownNode } from '@neko/markdown';
import { cn } from '../utils';

export interface MarkdownDocumentViewProps {
  readonly value: string;
  readonly className?: string;
}

export function MarkdownDocumentView({
  value,
  className,
}: MarkdownDocumentViewProps): ReactElement {
  const result = useMemo(() => parseNormalizedMarkdown(value), [value]);

  if (result.status === 'failed') {
    return (
      <div
        className={cn('whitespace-pre-wrap break-words text-sm text-red-700', className)}
        data-markdown-document="failed"
      >
        Markdown could not be rendered: {result.diagnostics.map((item) => item.code).join(', ')}
      </div>
    );
  }

  return (
    <div
      className={cn('min-w-0 break-words text-sm leading-6 text-[var(--node-fg)]', className)}
      data-markdown-document="ready"
    >
      {renderMarkdownNode(result.document.root)}
    </div>
  );
}

function renderMarkdownNode(node: MarkdownNode): ReactNode {
  const children = 'children' in node ? renderMarkdownChildren(node.children) : undefined;
  switch (node.type) {
    case 'root':
      return children;
    case 'paragraph':
      return <p className="my-2 first:mt-0 last:mb-0">{children}</p>;
    case 'heading':
      return renderHeading(node.depth, children);
    case 'blockquote':
      return (
        <blockquote className="my-3 border-l-4 border-[var(--node-divider)] pl-3 text-[var(--node-fg-secondary)]">
          {children}
        </blockquote>
      );
    case 'list': {
      const listClassName = 'my-2 space-y-1 pl-6';
      return node.kind === 'ordered' ? (
        <ol className={`${listClassName} list-decimal`} start={node.start}>
          {children}
        </ol>
      ) : (
        <ul className={`${listClassName} list-disc`}>{children}</ul>
      );
    }
    case 'listItem':
      return (
        <li className="pl-0.5">
          {typeof node.checked === 'boolean' && (
            <input
              type="checkbox"
              checked={node.checked}
              readOnly
              tabIndex={-1}
              className="mr-2 align-middle"
              aria-label={node.checked ? 'Completed task' : 'Incomplete task'}
            />
          )}
          {children}
        </li>
      );
    case 'codeBlock':
      return (
        <pre className="my-3 overflow-auto rounded bg-black/5 p-3 text-xs leading-5">
          <code data-markdown-code-language={node.language.normalized}>{node.value}</code>
        </pre>
      );
    case 'thematicBreak':
      return <hr className="my-4 border-0 border-t border-[var(--node-divider)]" />;
    case 'html':
      return (
        <code
          className={node.block ? 'my-2 block whitespace-pre-wrap text-xs' : 'text-xs'}
          data-markdown-html-inert="true"
        >
          {node.value}
        </code>
      );
    case 'definition':
      return null;
    case 'text':
      return node.value;
    case 'softBreak':
      return ' ';
    case 'hardBreak':
      return <br />;
    case 'emphasis':
      return <em>{children}</em>;
    case 'strong':
      return <strong>{children}</strong>;
    case 'delete':
      return <del>{children}</del>;
    case 'inlineCode':
      return <code className="rounded bg-black/5 px-1 py-0.5 text-[0.9em]">{node.value}</code>;
    case 'link':
      return isSafeMarkdownLink(node.destination) ? (
        <a
          href={node.destination}
          title={node.title}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          {children}
        </a>
      ) : (
        <span data-markdown-unsafe-link="true" title={node.title}>
          {children}
        </span>
      );
    case 'linkReference':
      return <span data-markdown-unresolved-link-reference={node.identifier}>{children}</span>;
    case 'image':
      return renderNonFetchingImage(node.altText, node.destination, node.title);
    case 'imageReference':
      return renderNonFetchingImage(node.altText, node.identifier, node.label);
    case 'table':
      return (
        <div className="my-3 overflow-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>{renderMarkdownNode(node.header)}</thead>
            <tbody>{node.rows.map((row) => renderMarkdownNode(row))}</tbody>
          </table>
        </div>
      );
    case 'tableRow': {
      const Cell = node.header ? 'th' : 'td';
      return (
        <tr>
          {node.cells.map((cell) => (
            <Cell key={cell.id} className="border border-[var(--node-divider)] px-2 py-1 align-top">
              {renderMarkdownChildren(cell.children)}
            </Cell>
          ))}
        </tr>
      );
    }
    case 'tableCell':
      return children;
    case 'nekoMention':
      return <span data-markdown-mention="true">{node.raw}</span>;
    case 'nekoResourceReference':
      return <span data-markdown-resource-reference="true">{node.raw}</span>;
  }
}

function renderMarkdownChildren(nodes: readonly MarkdownNode[]): ReactNode {
  return nodes.map((node) => <Fragment key={node.id}>{renderMarkdownNode(node)}</Fragment>);
}

function renderHeading(depth: 1 | 2 | 3 | 4 | 5 | 6, children: ReactNode): ReactElement {
  const className = getHeadingClassName(depth);
  switch (depth) {
    case 1:
      return <h1 className={className}>{children}</h1>;
    case 2:
      return <h2 className={className}>{children}</h2>;
    case 3:
      return <h3 className={className}>{children}</h3>;
    case 4:
      return <h4 className={className}>{children}</h4>;
    case 5:
      return <h5 className={className}>{children}</h5>;
    case 6:
      return <h6 className={className}>{children}</h6>;
  }
}

function getHeadingClassName(depth: number): string {
  if (depth === 1) return 'mb-3 mt-4 text-2xl font-bold leading-tight first:mt-0';
  if (depth === 2) return 'mb-2 mt-4 text-xl font-semibold leading-tight first:mt-0';
  if (depth === 3) return 'mb-2 mt-3 text-lg font-semibold leading-tight first:mt-0';
  return 'mb-1 mt-3 font-semibold leading-tight first:mt-0';
}

function renderNonFetchingImage(altText: string, source: string, title?: string): ReactElement {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded bg-black/5 px-1.5 py-0.5 text-xs text-[var(--node-fg-secondary)]"
      data-markdown-image-placeholder="true"
      data-markdown-image-source={source}
      title={title ?? source}
    >
      <span aria-hidden="true">▧</span>
      <span className="truncate">{altText || 'Image'}</span>
    </span>
  );
}

function isSafeMarkdownLink(destination: string): boolean {
  try {
    const url = new URL(destination);
    return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
}
