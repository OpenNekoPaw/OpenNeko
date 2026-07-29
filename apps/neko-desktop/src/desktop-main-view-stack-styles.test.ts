import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('./renderer/styles.css', import.meta.url), 'utf8');

describe('Desktop Main view stack styles', () => {
  it('fills Main with the active view and removes inactive retained views from layout', () => {
    expect(styles).toMatch(
      /\.project-main-view-stack__item\s*\{[\s\S]*?width\s*:\s*100%[\s\S]*?height\s*:\s*100%/u,
    );
    expect(styles).toMatch(
      /\.project-main-view-stack__item\[hidden\]\s*\{[\s\S]*?display\s*:\s*none/u,
    );
  });
});
