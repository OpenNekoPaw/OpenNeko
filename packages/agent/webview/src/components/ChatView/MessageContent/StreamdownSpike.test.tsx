import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Streamdown } from 'streamdown';
import { OPENNEKO_GFM_CONFORMANCE_CASES } from '@neko/markdown/testing';

afterEach(cleanup);

function Candidate({ content, streaming = false }: { content: string; streaming?: boolean }) {
  return (
    <Streamdown
      mode={streaming ? 'streaming' : 'static'}
      parseIncompleteMarkdown
      controls={false}
      skipHtml={false}
    >
      {content}
    </Streamdown>
  );
}

describe('Streamdown 2.5.0 Agent renderer spike', () => {
  it('consumes the package-owned corpus rather than a private Markdown profile', () => {
    const standardFixtures = OPENNEKO_GFM_CONFORMANCE_CASES.filter(
      (fixture) => fixture.id !== 'openneko-source-backed-extensions',
    );
    expect(standardFixtures.length).toBeGreaterThan(0);
    for (const fixture of standardFixtures) {
      const { unmount } = render(<Candidate content={fixture.source} />);
      unmount();
    }
  });

  it('passes completed GFM/CJK and keeps an incomplete suffix visible', () => {
    const content = [
      '# 中文标题',
      '',
      '~单波浪~ 与 ~~双波浪~~',
      '',
      '- [x] 已完成',
      '- [ ] 待处理',
      '',
      '| 场景 | 状态 |',
      '| :--- | ---: |',
      '| 开场 | 完成 |',
      '',
      '**尚未闭合',
    ].join('\n');
    const { container } = render(<Candidate content={content} streaming />);

    expect(container.querySelector('h1')?.textContent).toBe('中文标题');
    expect(container.querySelectorAll('del')).toHaveLength(2);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.textContent).toContain('尚未闭合');
    expect(container.textContent).toContain('尚未闭合');
  });

  it('keeps completed blocks stable while appending a mutable suffix', () => {
    const { container, rerender } = render(<Candidate content={'第一段。\n\n第二段'} streaming />);
    const root = container.firstElementChild;
    const firstParagraph = container.querySelector('p');

    rerender(<Candidate content={'第一段。\n\n第二段继续。'} streaming />);

    expect(container.firstElementChild).toBe(root);
    expect(container.querySelector('p')).toBe(firstParagraph);
    expect(container.textContent).toContain('第二段继续。');
  });

  it('sanitizes hostile HTML and unsafe destinations', () => {
    const { container } = render(
      <Candidate content={'<script>alert(1)</script>\n\n[危险](javascript:alert(2))'} />,
    );

    expect(container.querySelector('script')).toBeNull();
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).not.toBe('javascript:alert(2)');
  });

  it('records the renewed hard-gate failure for owner-aware Workspace resource references', () => {
    const { container } = render(<Candidate content={'请查看 ![[cover.png]] 和 [[notes.md]]。'} />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-markdown-resource-reference]')).toBeNull();
    expect(container.textContent).toContain('[[cover.png]]');
  });

  it('keeps typed sibling responsibilities out of the candidate contract', () => {
    const content = '| scene | shot | action |\n| --- | --- | --- |\n| 1 | 1 | 角色入场 |';
    const { container } = render(<Candidate content={content} />);

    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelector('[data-rich-content-type]')).toBeNull();
  });
});
