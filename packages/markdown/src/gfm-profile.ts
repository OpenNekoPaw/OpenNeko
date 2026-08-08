export type OpenNekoMarkdownExtensionId =
  'mermaid-fence' | 'math' | 'footnote' | 'neko-mention' | 'neko-resource-reference';

export type OpenNekoMarkdownSemanticProjection =
  'standard-code-block' | 'extension-node' | 'source-only' | 'unsupported';

export type OpenNekoMarkdownRichRoundTrip = 'standard-gfm' | 'source-preserving-adapter-required';

export interface OpenNekoMarkdownExtensionDeclaration {
  readonly id: OpenNekoMarkdownExtensionId;
  readonly syntax: string;
  readonly semanticProjection: OpenNekoMarkdownSemanticProjection;
  readonly richRoundTrip: OpenNekoMarkdownRichRoundTrip;
}

export interface OpenNekoGfmProfile {
  readonly specification: 'GFM 0.29-gfm';
  readonly specificationUrl: 'https://github.github.com/gfm/';
  readonly singleTildeStrikethrough: true;
  readonly rawHtml: 'preserve-source-render-inert';
  readonly externalUrlProtocols: readonly ['http', 'https', 'mailto'];
  readonly extensions: readonly OpenNekoMarkdownExtensionDeclaration[];
}

const OPENNEKO_MARKDOWN_EXTENSIONS = Object.freeze<readonly OpenNekoMarkdownExtensionDeclaration[]>(
  [
    Object.freeze({
      id: 'mermaid-fence',
      syntax: 'fenced code block with the mermaid language identity',
      semanticProjection: 'standard-code-block',
      richRoundTrip: 'standard-gfm',
    }),
    Object.freeze({
      id: 'math',
      syntax: 'inline or block math delimiter syntax',
      semanticProjection: 'source-only',
      richRoundTrip: 'source-preserving-adapter-required',
    }),
    Object.freeze({
      id: 'footnote',
      syntax: 'footnote reference and definition syntax',
      semanticProjection: 'unsupported',
      richRoundTrip: 'source-preserving-adapter-required',
    }),
    Object.freeze({
      id: 'neko-mention',
      syntax: '@label mention syntax in eligible plain-text source regions',
      semanticProjection: 'extension-node',
      richRoundTrip: 'source-preserving-adapter-required',
    }),
    Object.freeze({
      id: 'neko-resource-reference',
      syntax: '[[resource]] link and ![[resource]] embed syntax',
      semanticProjection: 'extension-node',
      richRoundTrip: 'source-preserving-adapter-required',
    }),
  ],
);

export const OPENNEKO_GFM_PROFILE: OpenNekoGfmProfile = Object.freeze({
  specification: 'GFM 0.29-gfm',
  specificationUrl: 'https://github.github.com/gfm/',
  singleTildeStrikethrough: true,
  rawHtml: 'preserve-source-render-inert',
  externalUrlProtocols: Object.freeze(['http', 'https', 'mailto'] as const),
  extensions: OPENNEKO_MARKDOWN_EXTENSIONS,
});

export function isOpenNekoMarkdownExternalUrlProtocol(protocol: string): boolean {
  const normalized = protocol.trim().toLowerCase().replace(/:$/u, '');
  return OPENNEKO_GFM_PROFILE.externalUrlProtocols.some((candidate) => candidate === normalized);
}
