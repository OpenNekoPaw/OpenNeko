import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('./extension-management.css', import.meta.url), 'utf8');

describe('Extension management styles', () => {
  it('keeps one prominent mode selector with accessible selected and focus states', () => {
    expect(styles).toMatch(/\.extension-management-mode-switcher\s*\{/u);
    expect(styles).toMatch(
      /\.extension-management-mode-switcher button\[aria-selected='true'\]\s*\{[^}]*background:\s*var\(--neko-button-background\)/u,
    );
    expect(styles).toMatch(
      /\.extension-management-mode-switcher button:focus-visible\s*\{[^}]*box-shadow:\s*var\(--neko-desktop-focus-ring\)/u,
    );
  });

  it('uses bounded cards, search and responsive layout for both package roots', () => {
    expect(styles).toMatch(
      /\.agent-extension-management-root \.management-surface-list\.is-grid,[\s\S]*?grid-template-columns:\s*repeat\(auto-fill, 214px\)/u,
    );
    expect(styles).toMatch(
      /\.agent-extension-management-root \.management-search-field,[\s\S]*?max-width:\s*520px/u,
    );
    expect(styles).toMatch(
      /@container extension-management \(max-width: 820px\)[\s\S]*?flex-basis:\s*100%/u,
    );
  });

  it('preserves selected cards and bounded package-owned detail overlays', () => {
    expect(styles).toMatch(
      /\.agent-extension-management-root \.agent-extension-catalog-row\[data-selected='true'\],[\s\S]*?box-shadow:/u,
    );
    expect(styles).toMatch(
      /\[role='dialog'\]\.agent-extension-detail-overlay\s*\{[^}]*width:\s*min\(560px,/u,
    );
    expect(styles).toMatch(
      /\[role='dialog'\]\.professional-application-detail-overlay\s*\{[^}]*width:\s*min\(760px,/u,
    );
  });
});
