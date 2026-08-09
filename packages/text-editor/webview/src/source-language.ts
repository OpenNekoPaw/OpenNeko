import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import type { TextDocumentProjection } from '@neko/text-editor-domain';
import { tags } from '@lezer/highlight';

const replaceFountainDecorations = StateEffect.define<DecorationSet>();

const fountainDecorationField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(replaceFountainDecorations)) next = effect.value;
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const openNekoHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.definitionKeyword, tags.modifier],
    color: 'var(--neko-syntax-keyword)',
  },
  { tag: [tags.name, tags.variableName], color: 'var(--neko-syntax-name)' },
  { tag: [tags.propertyName, tags.attributeName], color: 'var(--neko-syntax-property)' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--neko-syntax-type)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--neko-syntax-string)' },
  { tag: [tags.number, tags.bool, tags.atom], color: 'var(--neko-syntax-number)' },
  { tag: [tags.regexp, tags.escape], color: 'var(--neko-syntax-regexp)' },
  {
    tag: [tags.heading, tags.strong],
    color: 'var(--neko-syntax-heading)',
    fontWeight: '650',
  },
  { tag: tags.emphasis, color: 'var(--neko-syntax-emphasis)', fontStyle: 'italic' },
  { tag: [tags.link, tags.url], color: 'var(--neko-syntax-link)', textDecoration: 'underline' },
  { tag: [tags.comment, tags.meta], color: 'var(--neko-syntax-comment)', fontStyle: 'italic' },
  {
    tag: [tags.operator, tags.punctuation, tags.bracket],
    color: 'var(--neko-syntax-punctuation)',
  },
  { tag: tags.invalid, color: '#c33c3c', textDecoration: 'underline wavy' },
]);

export function sourceLanguageExtensions(projection: TextDocumentProjection): readonly Extension[] {
  const extensions: Extension[] = [syntaxHighlighting(openNekoHighlightStyle)];
  if (projection.mode === 'markdown') return [...extensions, markdown()];
  if (projection.mode === 'json') return [...extensions, json()];
  if (projection.mode === 'fountain') return [...extensions, fountainDecorationField];

  const extension = documentExtension(projection.identity.documentId);
  switch (extension) {
    case 'html':
      return [...extensions, html()];
    case 'xml':
      return [...extensions, xml()];
    case 'css':
      return [...extensions, css()];
    case 'js':
      return [...extensions, javascript()];
    case 'jsx':
      return [...extensions, javascript({ jsx: true })];
    case 'ts':
      return [...extensions, javascript({ typescript: true })];
    case 'tsx':
      return [...extensions, javascript({ jsx: true, typescript: true })];
    case 'yaml':
    case 'yml':
      return [...extensions, yaml()];
    default:
      return extensions;
  }
}

export function refreshSourceDecorations(
  view: EditorView,
  projection: TextDocumentProjection,
): void {
  if (projection.mode !== 'fountain') return;
  const docLength = view.state.doc.length;
  const ranges = (projection.screenplay?.elements ?? [])
    .map((element) => {
      const from = Math.min(element.range.start.offset, docLength);
      const to = Math.min(element.range.end.offset, docLength);
      if (to <= from) return undefined;
      return Decoration.mark({ class: `cm-fountain-${element.kind}` }).range(from, to);
    })
    .filter((range): range is NonNullable<typeof range> => range !== undefined)
    .sort((left, right) => left.from - right.from || left.to - right.to);
  view.dispatch({ effects: replaceFountainDecorations.of(Decoration.set(ranges, true)) });
}

function documentExtension(documentId: string): string | undefined {
  const filename = documentId.split('/').at(-1);
  const separator = filename?.lastIndexOf('.') ?? -1;
  if (!filename || separator < 1 || separator === filename.length - 1) return undefined;
  return filename.slice(separator + 1).toLowerCase();
}
