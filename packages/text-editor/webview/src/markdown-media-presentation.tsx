import { Plugin } from '@milkdown/prose/state';
import { Decoration, DecorationSet, type NodeViewConstructor } from '@milkdown/prose/view';
import { projectNekoMarkdownExtensions } from '@neko/markdown';
import {
  assertPrepareTextEditorMarkdownMediaRequest,
  type PrepareTextEditorMarkdownMediaRequest,
  type TextDocumentProjection,
  type TextEditorMarkdownMediaDiagnosticCode,
  type TextEditorMarkdownMediaProjection,
  type TextEditorMarkdownMediaToken,
} from '@neko/text-editor-domain';
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { TextEditorHostRuntime } from './host-runtime';
import {
  textEditorLabel,
  textEditorMarkdownMediaDiagnosticLabel,
  type TextEditorLocale,
} from './labels';

const MEDIA_ANCHOR = 'data-neko-markdown-media-anchor';
const MEDIA_TARGET = 'data-neko-markdown-media-target';
const MEDIA_ALT = 'data-neko-markdown-media-alt';
const MEDIA_FROM = 'data-neko-markdown-media-from';
const MEDIA_TO = 'data-neko-markdown-media-to';

interface MarkdownMediaPortalTarget {
  readonly key: string;
  readonly anchor: HTMLElement;
  readonly token: TextEditorMarkdownMediaToken;
}

export interface MarkdownMediaPresentationProps {
  readonly root: HTMLElement | null;
  readonly projection: TextDocumentProjection;
  readonly runtime: TextEditorHostRuntime;
  readonly locale: TextEditorLocale;
  readonly surfaceId: string;
  readonly nextRequestId: () => string;
  readonly onError: (message: string) => void;
  readonly onRevealSource: (offset: number) => void;
}

export function createMarkdownMediaMilkdownPlugins(readSource: () => string): {
  readonly imageNodeView: [string, NodeViewConstructor];
  readonly resourceDecorationPlugin: Plugin;
} {
  const imageNodeView: [string, NodeViewConstructor] = [
    'image',
    ((node) => {
      const dom = document.createElement('span');
      dom.setAttribute(MEDIA_ANCHOR, 'commonmark-image');
      dom.setAttribute('contenteditable', 'false');
      updateImageAnchor(dom, node.attrs['src'], node.attrs['alt']);
      return {
        dom,
        ignoreMutation: () => true,
        update(nextNode) {
          if (nextNode.type.name !== 'image') return false;
          updateImageAnchor(dom, nextNode.attrs['src'], nextNode.attrs['alt']);
          return true;
        },
      };
    }) satisfies NodeViewConstructor,
  ];

  const resourceDecorationPlugin: Plugin<DecorationSet> = new Plugin<DecorationSet>({
    state: {
      init: (_configuration, state) => createResourceDecorations(state.doc, readSource()),
      apply: (transaction, current, _oldState, nextState): DecorationSet =>
        transaction.docChanged || transaction.getMeta(resourceDecorationPlugin)
          ? createResourceDecorations(nextState.doc, readSource())
          : current.map(transaction.mapping, transaction.doc),
    },
    props: {
      decorations(state) {
        return resourceDecorationPlugin.getState(state) as DecorationSet | undefined;
      },
    },
  });

  return { imageNodeView, resourceDecorationPlugin };
}

export function MarkdownMediaPresentation({
  root,
  projection,
  runtime,
  locale,
  surfaceId,
  nextRequestId,
  onError,
  onRevealSource,
}: MarkdownMediaPresentationProps): ReactElement {
  const [targets, setTargets] = useState<readonly MarkdownMediaPortalTarget[]>([]);

  useEffect(() => {
    if (!root) {
      setTargets([]);
      return;
    }
    const refresh = () => {
      const next = collectPortalTargets(root, projection.source);
      setTargets((current) => (samePortalTargets(current, next) ? current : next));
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(root, { childList: true, subtree: true, attributes: true });
    return () => observer.disconnect();
  }, [projection.source, root]);

  return (
    <>
      {targets.map(({ anchor, key, token }) =>
        createPortal(
          <MarkdownMediaPresenter
            key={key}
            projection={projection}
            runtime={runtime}
            locale={locale}
            surfaceId={surfaceId}
            token={token}
            nextRequestId={nextRequestId}
            onError={onError}
            onRevealSource={onRevealSource}
          />,
          anchor,
          key,
        ),
      )}
    </>
  );
}

function MarkdownMediaPresenter({
  projection,
  runtime,
  locale,
  surfaceId,
  token,
  nextRequestId,
  onError,
  onRevealSource,
}: Omit<MarkdownMediaPresentationProps, 'root'> & {
  readonly token: TextEditorMarkdownMediaToken;
}): ReactElement {
  const [state, setState] = useState<
    | { readonly status: 'loading' }
    | {
        readonly status: 'ready';
        readonly projection: TextEditorMarkdownMediaProjection & { readonly status: 'ready' };
      }
    | { readonly status: 'unavailable'; readonly code: TextEditorMarkdownMediaDiagnosticCode }
  >({ status: 'loading' });
  const lease =
    useRef<(TextEditorMarkdownMediaProjection & { readonly status: 'ready' })['descriptor']>();

  useEffect(() => {
    let active = true;
    const abortController = new AbortController();
    const request: PrepareTextEditorMarkdownMediaRequest = {
      requestId: nextRequestId(),
      identity: projection.identity,
      sessionId: projection.sessionId,
      editSequence: projection.editSequence,
      surfaceId,
      token,
    };
    try {
      assertPrepareTextEditorMarkdownMediaRequest(request);
    } catch {
      setState({ status: 'unavailable', code: 'text-editor-markdown-media-unauthorized' });
      return () => abortController.abort();
    }
    setState({ status: 'loading' });
    void runtime
      .prepareMarkdownMedia(request, abortController.signal)
      .then((result) => {
        if (!active) {
          if (result.status === 'ready') {
            void releaseDescriptor(result.descriptor).catch((error: unknown) =>
              onError(errorMessage(error)),
            );
          }
          return;
        }
        if (result.status === 'unavailable') {
          setState({ status: 'unavailable', code: result.diagnostic.code });
          return;
        }
        lease.current = result.descriptor;
        setState({ status: 'ready', projection: result });
      })
      .catch((error: unknown) => {
        if (!active) return;
        onError(errorMessage(error));
        setState({ status: 'unavailable', code: 'text-editor-markdown-media-projection-failed' });
      });

    return () => {
      active = false;
      abortController.abort();
      const current = lease.current;
      lease.current = undefined;
      if (current) {
        void releaseDescriptor(current).catch((error: unknown) => onError(errorMessage(error)));
      }
    };

    function releaseDescriptor(descriptor: { readonly leaseId: string }): Promise<void> {
      return runtime.releaseMarkdownMedia({
        requestId: nextRequestId(),
        identity: projection.identity,
        sessionId: projection.sessionId,
        surfaceId,
        leaseId: descriptor.leaseId,
      });
    }
  }, [
    nextRequestId,
    onError,
    projection.editSequence,
    projection.identity,
    projection.sessionId,
    runtime,
    surfaceId,
    token,
  ]);

  const label = token.altText || token.target;
  const reveal = (
    <button
      type="button"
      className="neko-markdown-media__reveal"
      onClick={() => onRevealSource(token.from)}
    >
      <span className="codicon codicon-code" aria-hidden="true" />
      <span>{textEditorLabel(locale, 'revealMediaSource')}</span>
    </button>
  );

  if (state.status === 'loading') {
    return (
      <span className="neko-markdown-media" data-media-state="loading" role="status">
        <span className="neko-markdown-media__label">{label}</span>
        <span>{textEditorLabel(locale, 'mediaLoading')}</span>
      </span>
    );
  }
  if (state.status === 'unavailable') {
    return (
      <span className="neko-markdown-media" data-media-state="unavailable" role="group">
        <span className="neko-markdown-media__diagnostic" role="alert">
          <span className="codicon codicon-warning" aria-hidden="true" />
          <span>
            <strong>{label}</strong>
            {' - '}
            {textEditorMarkdownMediaDiagnosticLabel(locale, state.code)}
          </span>
        </span>
        {reveal}
      </span>
    );
  }

  const descriptor = state.projection.descriptor;
  const failPresentation = () => {
    const current = lease.current;
    lease.current = undefined;
    if (current) {
      void runtime
        .releaseMarkdownMedia({
          requestId: nextRequestId(),
          identity: projection.identity,
          sessionId: projection.sessionId,
          surfaceId,
          leaseId: current.leaseId,
        })
        .catch((error: unknown) => onError(errorMessage(error)));
    }
    setState({ status: 'unavailable', code: 'text-editor-markdown-media-projection-failed' });
  };
  let media: ReactNode;
  if (descriptor.kind === 'image') {
    media = (
      <img
        src={descriptor.renderUri}
        alt={token.altText ?? descriptor.displayName}
        loading="lazy"
        onError={failPresentation}
      />
    );
  } else if (descriptor.kind === 'audio') {
    media = (
      <audio
        src={descriptor.renderUri}
        aria-label={descriptor.displayName}
        controls
        preload="metadata"
        onError={failPresentation}
      />
    );
  } else {
    media = (
      <video
        src={descriptor.renderUri}
        aria-label={descriptor.displayName}
        controls
        playsInline
        preload="metadata"
        onError={failPresentation}
      />
    );
  }
  return (
    <span
      className="neko-markdown-media"
      data-media-kind={descriptor.kind}
      data-media-state="ready"
    >
      {media}
      <span className="neko-markdown-media__caption">
        <span>{label}</span>
        {reveal}
      </span>
    </span>
  );
}

function createResourceDecorations(
  documentNode: Parameters<typeof DecorationSet.create>[0],
  source: string,
): DecorationSet {
  const projection = projectNekoMarkdownExtensions(source, { resourceReferences: 'enabled' });
  const embeds = projection.resourceReferences.filter((reference) => reference.embed);
  if (embeds.length === 0) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  const textNodes: { readonly text: string; readonly position: number }[] = [];
  documentNode.descendants((node, position) => {
    if (isLiteralNode(node.type.name)) return false;
    if (node.isText && node.text) textNodes.push({ text: node.text, position });
    return true;
  });
  let nodeIndex = 0;
  let nodeCursor = 0;
  for (const token of embeds) {
    for (let candidateIndex = nodeIndex; candidateIndex < textNodes.length; candidateIndex += 1) {
      const textNode = textNodes[candidateIndex];
      if (!textNode) continue;
      const offset = textNode.text.indexOf(
        token.raw,
        candidateIndex === nodeIndex ? nodeCursor : 0,
      );
      if (offset < 0) continue;
      decorations.push(
        Decoration.widget(
          textNode.position + offset + token.raw.length,
          () => createResourceAnchor(token.range.startOffset, token.range.endOffset),
          {
            key: mediaKey(
              'resource-embed',
              token.range.startOffset,
              token.range.endOffset,
              token.lookupToken,
            ),
          },
        ),
      );
      nodeIndex = candidateIndex;
      nodeCursor = offset + token.raw.length;
      break;
    }
  }
  return DecorationSet.create(documentNode, decorations);
}

function createResourceAnchor(from: number, to: number): HTMLElement {
  const anchor = document.createElement('span');
  anchor.setAttribute(MEDIA_ANCHOR, 'resource-embed');
  anchor.setAttribute(MEDIA_FROM, String(from));
  anchor.setAttribute(MEDIA_TO, String(to));
  anchor.setAttribute('contenteditable', 'false');
  return anchor;
}

function collectPortalTargets(
  root: HTMLElement,
  source: string,
): readonly MarkdownMediaPortalTarget[] {
  const projection = projectNekoMarkdownExtensions(source, { resourceReferences: 'enabled' });
  const usedImages = new Set<number>();
  const targets: MarkdownMediaPortalTarget[] = [];
  for (const anchor of root.querySelectorAll<HTMLElement>(`[${MEDIA_ANCHOR}]`)) {
    const kind = anchor.getAttribute(MEDIA_ANCHOR);
    if (kind === 'commonmark-image') {
      const rawTarget = anchor.getAttribute(MEDIA_TARGET) ?? '';
      const altText = anchor.getAttribute(MEDIA_ALT) ?? '';
      const index = projection.images.findIndex(
        (image, candidateIndex) =>
          !usedImages.has(candidateIndex) &&
          image.rawTarget === rawTarget &&
          image.altText === altText,
      );
      const image = projection.images[index];
      if (!image) continue;
      usedImages.add(index);
      targets.push({
        anchor,
        key: mediaKey(kind, image.range.startOffset, image.range.endOffset, image.lookupToken),
        token: {
          kind,
          from: image.range.startOffset,
          to: image.range.endOffset,
          target: image.lookupToken,
          altText: image.altText,
        },
      });
      continue;
    }
    if (kind !== 'resource-embed') continue;
    const from = Number(anchor.getAttribute(MEDIA_FROM));
    const to = Number(anchor.getAttribute(MEDIA_TO));
    const resource = projection.resourceReferences.find(
      (candidate) =>
        candidate.embed && candidate.range.startOffset === from && candidate.range.endOffset === to,
    );
    if (!resource) continue;
    targets.push({
      anchor,
      key: mediaKey(kind, from, to, resource.lookupToken),
      token: {
        kind,
        from,
        to,
        target: resource.lookupToken,
        altText: resource.target,
      },
    });
  }
  return targets;
}

function updateImageAnchor(dom: HTMLElement, target: unknown, alt: unknown): void {
  dom.setAttribute(MEDIA_TARGET, typeof target === 'string' ? target : '');
  dom.setAttribute(MEDIA_ALT, typeof alt === 'string' ? alt : '');
}

function isLiteralNode(name: string): boolean {
  return name === 'code_block' || name === 'code_inline' || name === 'html';
}

function mediaKey(kind: string, from: number, to: number, target: string): string {
  return `${kind}:${from}:${to}:${target}`;
}

function samePortalTargets(
  left: readonly MarkdownMediaPortalTarget[],
  right: readonly MarkdownMediaPortalTarget[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (target, index) => target.key === right[index]?.key && target.anchor === right[index]?.anchor,
    )
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'text-editor-markdown-media-projection-failed';
}
