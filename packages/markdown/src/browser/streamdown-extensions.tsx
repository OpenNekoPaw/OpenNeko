/**
 * Browser-only Streamdown-facing extension surface.
 *
 * `@neko/markdown` remains the shared CommonMark/GFM semantic/profile/extension
 * owner. This entry supplies narrow remark/rehype plugins and React projection
 * components for the Agent Webview Streamdown renderer. It does not own Agent
 * streaming lifecycle, session registries, or resource authorization.
 */
import type { ReactNode } from 'react';
import type { Pluggable } from 'unified';
import { normalizeMarkdownResourceLookupToken, stripMarkdownPlacementHint } from '../parser';

export interface NekoMarkdownStreamdownResourceCandidate {
  readonly label?: string;
  readonly mimeType?: string;
}

export interface NekoMarkdownStreamdownResource {
  readonly token: string;
  readonly status: 'bound' | 'ambiguous' | 'missing' | string;
  readonly renderUris?: readonly string[];
  readonly refs?: readonly NekoMarkdownStreamdownResourceCandidate[];
  readonly diagnostics?: readonly {
    readonly severity?: string;
    readonly code?: string;
    readonly message?: string;
  }[];
}

export interface NekoMarkdownStreamdownMention {
  readonly raw: string;
  readonly label: string;
  readonly status: 'bound' | 'ambiguous' | 'missing' | string;
}

export interface NekoMarkdownStreamdownResourceReference {
  readonly raw: string;
  readonly target: string;
  readonly lookupToken: string;
  readonly embed: boolean;
  readonly status: 'bound' | 'ambiguous' | 'missing' | string;
}

export interface NekoMarkdownStreamdownResources {
  readonly tokens?: readonly NekoMarkdownStreamdownResource[];
  readonly mentions?: readonly NekoMarkdownStreamdownMention[];
  readonly resourceReferences?: readonly NekoMarkdownStreamdownResourceReference[];
}

export interface NekoMarkdownStreamdownComponentProps {
  readonly node?: {
    readonly properties?: Readonly<Record<string, unknown>>;
  };
  readonly children?: ReactNode;
  readonly resources?: NekoMarkdownStreamdownResources;
  readonly src?: string;
  readonly alt?: string;
  readonly href?: string;
  readonly [key: string]: unknown;
}

const EXTENSION_RE = /(!?)\[\[([^\]\n]+)\]\]|@([\p{L}\p{N}_.-]{1,80})/gu;
const MDAST_LITERAL_TYPES = new Set([
  'code',
  'definition',
  'html',
  'inlineCode',
  'link',
  'linkReference',
]);

type HastNode = HastElement | HastText | HastRoot;

interface MdastNode {
  readonly type: string;
  readonly value?: string;
  readonly children?: MdastNode[];
  readonly data?: {
    readonly hName?: string;
    readonly hProperties?: Readonly<Record<string, string>>;
  };
}

interface HastRoot {
  readonly type: 'root';
  readonly children: HastNode[];
}

interface HastElement {
  readonly type: 'element';
  readonly tagName: string;
  readonly properties: Record<string, string | number | boolean | undefined>;
  readonly children: HastNode[];
}

interface HastText {
  readonly type: 'text';
  readonly value: string;
}

/** Projects Neko text extensions only from Markdown text nodes. */
export function createNekoMarkdownRemarkPlugins(): Pluggable[] {
  return [createNekoMarkdownRemarkPlugin()];
}

export function createNekoMarkdownRemarkPlugin(): Pluggable {
  return () => (tree: unknown) => {
    transformMdastChildren(tree as MdastNode);
  };
}

export interface NekoMarkdownResourceImageRehypePluginOptions {
  /** Serializable token -> authorized render URI pairs supplied by Agent Webview. */
  readonly authorizedImageSources: readonly (readonly [token: string, renderUri: string])[];
}

/**
 * Rehype plugin that rewrites CommonMark image `src` tokens into already
 * authorized Workspace render URIs before Streamdown's default harden step.
 * The plugin must be registered as a plugin tuple so Streamdown's pipeline
 * cache can distinguish different authorized-resource sets.
 */
export function nekoMarkdownResourceImageRehypePlugin(
  options: NekoMarkdownResourceImageRehypePluginOptions,
): (tree: unknown) => void {
  const renderUriByToken = new Map(
    options.authorizedImageSources.map(([token, renderUri]) => [
      normalizeNekoMarkdownResourceToken(token),
      renderUri,
    ]),
  );
  return (tree: unknown) => {
    rewriteResourceImageSources(tree as HastRoot, (token) =>
      renderUriByToken.get(normalizeNekoMarkdownResourceToken(token)),
    );
  };
}

function rewriteResourceImageSources(
  root: HastRoot,
  resolveResourceImageSrc: (token: string) => string | undefined,
): void {
  const visit = (nodes: readonly HastNode[]): void => {
    for (const node of nodes) {
      if (node.type === 'element') {
        if (node.tagName === 'img') {
          const src = node.properties.src;
          if (typeof src === 'string' && src.length > 0) {
            const resolved = resolveResourceImageSrc(src);
            if (resolved) {
              (
                node as { properties: Record<string, string | number | boolean | undefined> }
              ).properties.src = resolved;
            }
          }
        }
        visit(node.children);
      }
    }
  };
  visit(root.children);
}

function transformMdastChildren(parent: MdastNode): void {
  if (MDAST_LITERAL_TYPES.has(parent.type) || !parent.children) return;
  const nextChildren: MdastNode[] = [];
  for (const child of parent.children) {
    if (child.type === 'text' && child.value !== undefined) {
      nextChildren.push(...transformText(child.value));
      continue;
    }
    transformMdastChildren(child);
    nextChildren.push(child);
  }
  (parent as { children: MdastNode[] }).children = nextChildren;
}

function transformText(value: string): MdastNode[] {
  const nodes: MdastNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(EXTENSION_RE)) {
    const matchIndex = match.index;
    if (matchIndex === undefined) continue;
    const mentionLabel = match[3];
    if (mentionLabel && !isEligibleMention(value, matchIndex)) continue;
    appendText(nodes, value.slice(cursor, matchIndex));
    const matchedToken = match[0] ?? '';
    const normalizedMentionLabel = mentionLabel ? trimMentionLabel(mentionLabel) : undefined;
    const rawToken = normalizedMentionLabel ? `@${normalizedMentionLabel}` : matchedToken;
    if (normalizedMentionLabel) {
      nodes.push(
        extensionNode('nekoMention', 'neko-mention', rawToken, {
          'data-neko-mention': 'true',
          'data-neko-label': normalizedMentionLabel,
          'data-neko-raw': rawToken,
        }),
      );
    } else {
      const target = match[2] ?? '';
      const placement = stripMarkdownPlacementHint(target);
      nodes.push(
        extensionNode('nekoResourceReference', 'neko-resource-reference', rawToken, {
          'data-neko-resource-reference': 'true',
          'data-neko-resource-reference-embed': match[1] === '!' ? 'true' : 'false',
          'data-neko-resource-reference-target': target,
          'data-neko-resource-reference-lookup-token': placement.lookupToken,
          'data-neko-raw': rawToken,
        }),
      );
    }
    cursor = matchIndex + rawToken.length;
  }
  appendText(nodes, value.slice(cursor));
  return nodes.length > 0 ? nodes : [{ type: 'text', value }];
}

function appendText(nodes: MdastNode[], value: string): void {
  if (value.length > 0) nodes.push({ type: 'text', value });
}

function extensionNode(
  type: string,
  hName: string,
  value: string,
  hProperties: Record<string, string>,
): MdastNode {
  return {
    type,
    data: { hName, hProperties },
    children: [{ type: 'text', value }],
  };
}

function isEligibleMention(value: string, index: number): boolean {
  if (index === 0) return true;
  const previous = value[index - 1] ?? '';
  return !/[\p{L}\p{N}_./-]/u.test(previous);
}

function trimMentionLabel(value: string): string {
  return value.replace(/[.,!?;:，。！？；：]+$/u, '');
}

/** URL transform that keeps Streamdown sanitize/harden and rejects raw/blob/cache/private identities. */
export function createNekoMarkdownUrlTransform(
  options: {
    readonly authorizedResourceUris?: ReadonlySet<string>;
  } = {},
) {
  const authorizedResourceUris = options.authorizedResourceUris ?? new Set<string>();
  return (url: string, key: string): string | null => {
    if (key === 'href') return isSafeMarkdownHref(url) ? url : null;
    if (key === 'src' || key === 'poster') {
      return authorizedResourceUris.has(url) ? url : null;
    }
    return null;
  };
}

function isSafeMarkdownHref(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) return true;
  return /^(?:https?:\/\/|mailto:)/iu.test(trimmed);
}

/** Normalizes the same token forms used by the package parser. */
export function normalizeNekoMarkdownResourceToken(value: string): string {
  return normalizeMarkdownResourceLookupToken(stripMarkdownPlacementHint(value).lookupToken);
}

function findResourceProjection(
  token: string,
  resources: NekoMarkdownStreamdownResources | undefined,
): NekoMarkdownStreamdownResource | undefined {
  if (!resources?.tokens) return undefined;
  const normalized = normalizeNekoMarkdownResourceToken(token);
  return resources.tokens.find(
    (candidate) => normalizeNekoMarkdownResourceToken(candidate.token) === normalized,
  );
}

function findResourceProjectionByRenderUri(
  renderUri: string,
  resources: NekoMarkdownStreamdownResources | undefined,
): NekoMarkdownStreamdownResource | undefined {
  if (!resources?.tokens) return undefined;
  return resources.tokens.find((candidate) =>
    (candidate.renderUris ?? []).some((uri) => uri === renderUri),
  );
}

function findMentionProjection(
  raw: string,
  label: string,
  resources: NekoMarkdownStreamdownResources | undefined,
): NekoMarkdownStreamdownMention | undefined {
  if (!resources?.mentions) return undefined;
  const normalizedRaw = normalizeNekoMarkdownResourceToken(raw);
  const normalizedLabel = normalizeNekoMarkdownResourceToken(label);
  return resources.mentions.find(
    (candidate) =>
      normalizeNekoMarkdownResourceToken(candidate.raw) === normalizedRaw ||
      normalizeNekoMarkdownResourceToken(candidate.label) === normalizedLabel,
  );
}

function findResourceReferenceProjection(
  raw: string,
  target: string,
  resources: NekoMarkdownStreamdownResources | undefined,
): NekoMarkdownStreamdownResourceReference | undefined {
  if (!resources?.resourceReferences) return undefined;
  const normalizedRaw = normalizeNekoMarkdownResourceToken(raw);
  const normalizedTarget = normalizeNekoMarkdownResourceToken(target);
  return resources.resourceReferences.find(
    (candidate) =>
      normalizeNekoMarkdownResourceToken(candidate.raw) === normalizedRaw ||
      normalizeNekoMarkdownResourceToken(candidate.target) === normalizedTarget ||
      normalizeNekoMarkdownResourceToken(candidate.lookupToken) === normalizedTarget,
  );
}

function readProperties(
  node: NekoMarkdownStreamdownComponentProps['node'],
): Readonly<Record<string, unknown>> {
  return node?.properties ?? {};
}

function readStringProp(
  properties: Readonly<Record<string, unknown>>,
  props: NekoMarkdownStreamdownComponentProps,
  key: string,
  defaultValue: string,
): string {
  const property = properties[key];
  const prop = props[key];
  const value =
    typeof property === 'string' ? property : typeof prop === 'string' ? prop : defaultValue;
  return value;
}

export function NekoMarkdownMention(props: NekoMarkdownStreamdownComponentProps): ReactNode {
  const properties = readProperties(props.node);
  const raw = readStringProp(properties, props, 'data-neko-raw', '');
  const label = readStringProp(properties, props, 'data-neko-label', raw.replace(/^@/u, ''));
  const projection = findMentionProjection(raw, label, props.resources);
  const status = projection?.status ?? 'missing';
  return (
    <span
      data-markdown-mention="true"
      data-markdown-mention-status={status}
      title={projection && projection.status === 'bound' ? raw : raw}
    >
      {props.children ?? raw}
    </span>
  );
}

export function NekoMarkdownResourceReference(
  props: NekoMarkdownStreamdownComponentProps,
): ReactNode {
  const properties = readProperties(props.node);
  const raw = readStringProp(properties, props, 'data-neko-raw', '');
  const target = readStringProp(properties, props, 'data-neko-resource-reference-target', raw);
  const embed =
    readStringProp(properties, props, 'data-neko-resource-reference-embed', 'false') === 'true';
  const projection = findResourceReferenceProjection(raw, target, props.resources);
  const status = projection?.status ?? 'missing';

  if (embed) {
    const resource = findResourceProjection(target, props.resources);
    const media = resource ? renderResourceMedia(resource, raw) : null;
    if (media) return media;
  }

  return (
    <span
      data-markdown-resource-reference="true"
      data-markdown-resource-reference-status={status}
      title={target}
    >
      {props.children ?? raw}
    </span>
  );
}

export function NekoMarkdownResourceImage(props: NekoMarkdownStreamdownComponentProps): ReactNode {
  const src = props.src ?? '';
  const alt = props.alt ?? '';
  const resource =
    findResourceProjectionByRenderUri(src, props.resources) ??
    findResourceProjection(src, props.resources);
  if (resource) {
    const media = renderResourceMedia(resource, alt || src);
    if (media) return media;
  }
  return (
    <span
      data-markdown-image-status={resource ? 'unprojected' : 'missing'}
      title={src || alt || undefined}
    >
      {alt || src || 'Image'}
    </span>
  );
}

function renderResourceMedia(resource: NekoMarkdownStreamdownResource, alt: string): ReactNode {
  const renderUris = resource.renderUris ?? [];
  if (renderUris.length === 0) {
    return <span data-markdown-resource-status={resource.status}>{resource.token || alt}</span>;
  }
  const renderUri = renderUris[0];
  const mimeType = resource.refs?.[0]?.mimeType?.toLowerCase() ?? '';
  const label = resource.refs?.[0]?.label ?? alt;
  if (mimeType.startsWith('audio/')) {
    return <audio controls src={renderUri} title={label} data-neko-resource-media="audio" />;
  }
  if (mimeType.startsWith('video/')) {
    return <video controls src={renderUri} title={label} data-neko-resource-media="video" />;
  }
  return (
    <img
      src={renderUri}
      alt={label}
      title={label}
      loading="lazy"
      data-neko-resource-media="image"
    />
  );
}
