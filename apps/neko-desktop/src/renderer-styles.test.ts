import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('./renderer/styles.css', import.meta.url), 'utf8');

describe('Desktop renderer styles', () => {
  it('keeps the temporary primary-sidebar hover hit region continuous', () => {
    const frameRule = styles.match(
      /\.application-primary-sidebar-frame\s*>\s*\.home-navigation\s*\{(?<body>[\s\S]*?)\n\}/u,
    );

    expect(frameRule?.groups?.body).toBeDefined();
    expect(frameRule?.groups?.body).not.toMatch(/transition\s*:[^;]*\bwidth\b/u);
  });

  it('keeps project layout controls in the primary-sidebar footer rather than over Main content', () => {
    expect(styles).toMatch(/\.home-navigation-footer__actions\s*\{[\s\S]*?display\s*:\s*flex/u);
    expect(styles).toMatch(
      /\.home-navigation--compact\s+\.home-navigation-footer__actions\s*\{[\s\S]*?flex-direction\s*:\s*column/u,
    );
    expect(styles).not.toMatch(/\.project-workbench-controls\s*\{/u);
  });
});
