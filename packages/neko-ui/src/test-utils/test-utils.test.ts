import { describe, expect, it } from 'vitest';
import { assertNoForbiddenClassPrefixes, getFocusableElements, hasAccessibleName } from './index';

describe('@neko/ui test-utils', () => {
  it('detects accessible names from aria, title, or text', () => {
    const button = document.createElement('button');
    expect(hasAccessibleName(button)).toBe(false);

    button.setAttribute('aria-label', 'Run');
    expect(hasAccessibleName(button)).toBe(true);

    button.removeAttribute('aria-label');
    button.title = 'Run';
    expect(hasAccessibleName(button)).toBe(true);
  });

  it('returns enabled focusable elements only', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <button>Run</button>
      <button disabled>Disabled</button>
      <a href="#x">Link</a>
      <div tabindex="-1">Skip</div>
    `;

    expect(getFocusableElements(root).map((element) => element.textContent)).toEqual([
      'Run',
      'Link',
    ]);
  });

  it('rejects package-specific class or token prefixes', () => {
    expect(() =>
      assertNoForbiddenClassPrefixes({ className: 'rounded bg-[var(--neko-surface)]' }),
    ).not.toThrow();
    expect(() => assertNoForbiddenClassPrefixes({ className: 'nk-panel bg-red-500' })).toThrow(
      'Forbidden package-specific UI token',
    );
    expect(() =>
      assertNoForbiddenClassPrefixes({ className: 'bg-[var(--sketch-panel-bg)]' }),
    ).toThrow('Forbidden package-specific UI token');
  });
});
