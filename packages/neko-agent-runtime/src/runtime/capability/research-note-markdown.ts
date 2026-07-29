import type { ResearchNote, ResearchSource } from '@neko/shared';

export interface ResearchNoteMarkdownFs {
  writeFile(path: string, content: string): Promise<void>;
}

export interface SaveResearchNoteMarkdownInput {
  readonly note: ResearchNote;
  readonly path: string;
  readonly fs: ResearchNoteMarkdownFs;
}

export async function saveResearchNoteMarkdown(
  input: SaveResearchNoteMarkdownInput,
): Promise<{ readonly path: string; readonly bytes: number }> {
  assertUserSelectedMarkdownPath(input.path);
  const markdown = serializeResearchNoteMarkdown(input.note);
  await input.fs.writeFile(input.path, markdown);
  return { path: input.path, bytes: Buffer.byteLength(markdown, 'utf8') };
}

export function serializeResearchNoteMarkdown(note: ResearchNote): string {
  return [
    '---',
    'source: external-research',
    `createdAt: ${JSON.stringify(note.createdAt)}`,
    `title: ${JSON.stringify(note.title)}`,
    '---',
    '',
    note.markdown.trim(),
    '',
    '## Sources',
    ...note.sources.map(formatResearchSource),
    '',
  ].join('\n');
}

function assertUserSelectedMarkdownPath(path: string): void {
  const normalized = path.replaceAll('\\', '/');
  if (!normalized.endsWith('.md')) {
    throw new Error('ResearchNote must be saved as a Markdown file.');
  }
  if (normalized === '.neko/memory.md' || normalized.includes('/.neko/memory.md')) {
    throw new Error('ResearchNote must not be saved into .neko project memory.');
  }
}

function formatResearchSource(source: ResearchSource): string {
  const label = source.title ?? source.url;
  const metadata = [
    `provider=${source.providerId}`,
    `mode=${source.mode}`,
    source.publishedAt ? `publishedAt=${source.publishedAt}` : undefined,
    source.fetchedAt ? `fetchedAt=${source.fetchedAt}` : undefined,
    source.searchedAt ? `searchedAt=${source.searchedAt}` : undefined,
  ].filter((item): item is string => item !== undefined);
  return `- [${escapeMarkdownLinkText(label)}](${source.url}) (${metadata.join(', ')})`;
}

function escapeMarkdownLinkText(value: string): string {
  return value.replaceAll('[', '\\[').replaceAll(']', '\\]');
}
