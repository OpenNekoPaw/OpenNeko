import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  new URL('./renderer/extension-management.css', import.meta.url),
  'utf8',
);

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

  it('uses bounded cards, flexible search and non-collapsing toolbar actions', () => {
    expect(styles).toMatch(
      /\.agent-extension-management-root \.management-surface-list\.is-grid,[\s\S]*?grid-template-columns:\s*repeat\(auto-fill, 214px\)/u,
    );
    expect(styles).toMatch(
      /\.agent-extension-management-root \.management-search-field,[\s\S]*?width:\s*auto[\s\S]*?min-width:\s*12rem[\s\S]*?flex:\s*1 1 24rem/u,
    );
    expect(styles).toMatch(
      /\.agent-extension-management-root \.management-surface-toolbar > button,[\s\S]*?width:\s*auto;[\s\S]*?min-width:\s*max-content;[\s\S]*?flex:\s*0 0 auto;[\s\S]*?white-space:\s*nowrap/u,
    );
    expect(styles).toMatch(
      /\.agent-extension-management-root \.management-segmented-control button,[\s\S]*?white-space:\s*nowrap/u,
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
    expect(styles).toMatch(
      /\.extension-detail-overlay__skill-content\s*\{[^}]*max-height:\s*260px;[^}]*overflow:\s*auto/u,
    );
    expect(styles).toMatch(
      /\.extension-detail-overlay__technical\s*\{[^}]*border-top:[^}]*padding-top:/u,
    );
  });

  it('aligns Skill, MCP and professional application card density and lifecycle treatment', () => {
    expect(styles).toMatch(
      /\.agent-extension-management-root \.agent-extension-catalog-row,[\s\S]*?\.professional-application-management-root \.professional-application-row\s*\{[^}]*height:\s*120px;[^}]*min-height:\s*120px/u,
    );
    expect(styles).toMatch(
      /\.agent-extension-catalog-row__status,[\s\S]*?\.professional-application-row__readiness\s*\{[^}]*display:\s*inline-flex;[^}]*margin-top:\s*0;[^}]*border-radius:\s*999px/u,
    );
    expect(styles).toMatch(
      /\.agent-extension-catalog-row__open,[\s\S]*?\.professional-application-row__open\s*\{[^}]*box-sizing:\s*border-box;[^}]*height:\s*100%;[^}]*justify-content:\s*center;[^}]*gap:\s*6px;[^}]*padding:\s*10px 12px/u,
    );
    expect(styles).toMatch(
      /\.agent-extension-catalog-row__summary,[\s\S]*?\.professional-application-row__summary\s*\{[^}]*min-height:\s*2\.8em;[^}]*line-height:\s*1\.4/u,
    );
    expect(styles).toMatch(
      /\.agent-extension-catalog-row__status,[\s\S]*?\.professional-application-row__readiness\s*\{[^}]*min-height:\s*20px;[^}]*padding:\s*3px 7px/u,
    );
    expect(styles).toMatch(
      /\.agent-extension-management-root \.agent-extension-catalog-row\[data-lifecycle-state='disabled'\],[\s\S]*?background:\s*color-mix/u,
    );
    expect(styles).toMatch(
      /\.agent-extension-catalog-row:has\(\.agent-extension-catalog-row__diagnostic\),[\s\S]*?height:\s*auto/u,
    );
  });
});
