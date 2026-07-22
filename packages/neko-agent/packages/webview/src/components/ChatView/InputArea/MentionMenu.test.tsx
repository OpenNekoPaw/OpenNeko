import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MentionMenu, getFilteredMentionItems, getMentionIcon } from './MentionMenu';
import type { MentionItem } from './types';

const translations: Record<string, string> = {
  'chat.input.mentionHint': 'Search mentions',
  'chat.input.mentionSearching': '"{filter}"',
  'chat.input.noMatchingFiles': 'No matching files found',
  'chat.input.mentionSections.file': 'Files',
  'chat.input.mentionSections.asset': 'Assets',
  'chat.input.mentionSections.entity': 'Entities',
  'chat.input.mentionTags.media.image': 'Image',
  'chat.input.mentionTags.media.document': 'Document',
  'chat.input.mentionTags.source.workspace': 'Workspace',
  'chat.input.mentionTags.source.mediaLibrary': 'Media',
  'chat.input.mentionTags.entity.character': 'Character',
};

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values?.['filter']
        ? (translations[key] ?? key).replace('{filter}', values['filter'])
        : (translations[key] ?? key),
  }),
}));

function mention(overrides: Partial<MentionItem>): MentionItem {
  return {
    id: 'item-1',
    kind: 'file',
    label: 'Item',
    ...overrides,
  };
}

describe('MentionMenu icon projection', () => {
  it('prefers protocol icons over inferred icons', () => {
    expect(getMentionIcon(mention({ icon: '◎', filePath: 'src/app.ts' }))).toBe('◎');
  });

  it('uses file extensions when host only provides a generic file icon', () => {
    expect(getMentionIcon(mention({ icon: 'file', filePath: 'assets/ref.zip' }))).toBe('ZIP');
    expect(getMentionIcon(mention({ icon: 'document', filePath: 'images/ref.jpeg' }))).toBe('JPG');
  });

  it('does not treat old emoji protocol icons as generic file icons', () => {
    expect(getMentionIcon(mention({ icon: '📄', filePath: 'assets/ref.zip' }))).toBe('📄');
    expect(getMentionIcon(mention({ icon: '🎬', filePath: 'cases/clip.mp4' }))).toBe('🎬');
  });

  it('infers media icons from media type', () => {
    expect(getMentionIcon(mention({ kind: 'media', mediaType: 'video' }))).toBe('video');
    expect(getMentionIcon(mention({ kind: 'media', mediaType: 'audio' }))).toBe('audio');
    expect(getMentionIcon(mention({ kind: 'media', mediaType: 'image' }))).toBe('image');
    expect(getMentionIcon(mention({ icon: 'image', kind: 'media', mediaType: 'image' }))).toBe(
      'image',
    );
  });

  it('keeps workspace TypeScript files as code-like entries', () => {
    expect(getMentionIcon(mention({ filePath: 'src/app.ts' }))).toBe('TS');
  });

  it('keeps keyboard filtering aligned with section ordering', () => {
    expect(
      getFilteredMentionItems(
        [
          mention({ id: 'scene', kind: 'scene', label: 'Scene' }),
          mention({ id: 'file', kind: 'file', label: 'File' }),
          mention({ id: 'asset', kind: 'asset', label: 'Asset' }),
        ],
        '',
      ).map((item) => item.kind),
    ).toEqual(['file', 'asset', 'scene']);
  });

  it('filters by host-provided search text and navigation metadata', () => {
    const items = [
      mention({
        id: 'asset',
        kind: 'asset',
        label: 'Portrait',
        searchText: '小橘 alias',
      }),
      mention({
        id: 'entity',
        kind: 'entity',
        label: 'Requirement',
        navigationData: { entityId: '小灰' },
      }),
    ];

    expect(getFilteredMentionItems(items, '小橘').map((item) => item.id)).toEqual(['asset']);
    expect(getFilteredMentionItems(items, '小灰').map((item) => item.id)).toEqual(['entity']);
  });

  it('ranks same-kind mentions by stronger text matches before label sort', () => {
    expect(
      getFilteredMentionItems(
        [
          mention({ id: 'deep-path', label: 'z-index.ts', filePath: 'src/ui/index.ts' }),
          mention({ id: 'prefix-label', label: 'index.ts', filePath: 'src/index.ts' }),
          mention({ id: 'later-label', label: 'App index', filePath: 'src/app.ts' }),
        ],
        'index',
      ).map((item) => item.id),
    ).toEqual(['prefix-label', 'deep-path', 'later-label']);
  });

  it('orders same-label file mentions by full path for stable results', () => {
    expect(
      getFilteredMentionItems(
        [
          mention({ id: 'b', label: 'index.ts', filePath: 'src/z/index.ts' }),
          mention({ id: 'a', label: 'index.ts', filePath: 'src/a/index.ts' }),
          mention({ id: 'root', label: 'index.ts', filePath: 'index.ts' }),
        ],
        'index',
      ).map((item) => item.filePath),
    ).toEqual(['index.ts', 'src/a/index.ts', 'src/z/index.ts']);
  });

  it('renders compact rows with localized section labels and tags', () => {
    const { container } = render(
      <MentionMenu
        isOpen
        filter=""
        items={[
          mention({
            id: 'file',
            label: 'project.json',
            filePath: 'config/project.json',
            source: 'workspace',
          }),
          mention({
            id: 'media',
            kind: 'media',
            label: 'Hero portrait',
            filePath: 'neko/assets/Characters/hero.png',
            mediaType: 'image',
            source: 'media-library',
            contextPayload: {
              type: 'media',
              id: 'media',
              label: 'Hero portrait',
              summary: 'Character reference portrait',
              data: {},
            },
          }),
          mention({
            id: 'entity',
            kind: 'entity',
            label: 'Xiaoju',
            entityType: 'character',
            contextPayload: {
              type: 'character',
              id: 'xiaoju',
              label: 'Xiaoju',
              summary: 'Character profile',
              data: {},
            },
          }),
        ]}
        selectedIndex={1}
        onSelectFile={vi.fn()}
        onSelectContext={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const panel = container.firstElementChild as HTMLElement;

    expect(screen.getByText('Files')).toBeTruthy();
    expect(screen.getByText('Media Library')).toBeTruthy();
    expect(screen.getByText('Entities')).toBeTruthy();
    expect(screen.getByText('config/project.json')).toBeTruthy();
    expect(screen.getByText('neko/assets/Characters/hero.png')).toBeTruthy();
    expect(screen.getByText('Image')).toBeTruthy();
    expect(screen.getByText('Character')).toBeTruthy();
    expect(panel.className).toContain('agent-composer-popover');
    expect(panel.className).toContain('agent-composer-mention-menu');
    expect(screen.getByRole('menu')).toBe(panel);

    const fileButton = screen.getByRole('menuitem', { name: /project\.json/i });
    expect(fileButton.className).toContain('agent-composer-popover-row');
    expect(fileButton.className).toContain('agent-composer-mention-row');
    expect(fileButton.getAttribute('title')).toBe('config/project.json');

    const fileName = screen.getByText('project.json');
    const filePath = screen.getByText('config/project.json');
    expect(fileName.parentElement).toBe(filePath.parentElement);
    expect(fileName.parentElement?.className).toContain('agent-composer-mention-main');
  });

  it('renders source and file type as separate tags for media library results', () => {
    render(
      <MentionMenu
        isOpen
        filter=""
        items={[
          mention({
            id: 'media',
            kind: 'media',
            label: 'book.epub',
            filePath: '${EPUBS}/Blame/book.epub',
            mediaType: 'document',
            source: 'media-library',
            navigationData: {
              partition: 'media-library',
              filePath: '${EPUBS}/Blame/book.epub',
              variable: 'EPUBS',
            },
          }),
        ]}
        selectedIndex={0}
        onSelectFile={vi.fn()}
        onSelectContext={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Media')).toBeTruthy();
    expect(screen.getByText('Document')).toBeTruthy();
    expect(screen.getByText('${EPUBS}/Blame/book.epub')).toBeTruthy();
  });

  it('selects path-backed Media Library mentions as file references', () => {
    const onSelectFile = vi.fn();
    const onSelectContext = vi.fn();
    const media = mention({
      id: 'media',
      kind: 'media',
      label: 'Hero portrait',
      filePath: 'neko/assets/Characters/hero.png',
      mediaType: 'image',
      source: 'media-library',
      contextPayload: {
        type: 'media',
        id: 'media',
        label: 'Hero portrait',
        summary: 'Character reference portrait',
        data: {},
      },
    });

    render(
      <MentionMenu
        isOpen
        filter=""
        items={[media]}
        selectedIndex={0}
        onSelectFile={onSelectFile}
        onSelectContext={onSelectContext}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('menuitem', { name: /Hero portrait/i }));

    expect(onSelectFile).toHaveBeenCalledWith(media);
    expect(onSelectContext).not.toHaveBeenCalled();
  });

  it('falls back to host-provided tags when no localized entity tag exists', () => {
    render(
      <MentionMenu
        isOpen
        filter=""
        items={[
          mention({
            id: 'entity',
            kind: 'entity',
            label: 'Magic prop',
            entityType: 'prop-special',
            contextPayload: {
              type: 'asset',
              id: 'prop',
              label: 'Magic prop',
              summary: 'Special prop',
              data: {},
            },
          }),
        ]}
        selectedIndex={0}
        onSelectFile={vi.fn()}
        onSelectContext={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('prop-special')).toBeTruthy();
  });
});
