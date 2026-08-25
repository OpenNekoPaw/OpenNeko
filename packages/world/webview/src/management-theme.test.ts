import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('World management theme contract', () => {
  it('uses canonical button and foreground semantics for the management catalog', () => {
    const style = readFileSync(resolve(import.meta.dirname, 'style.css'), 'utf8');

    expect(style).toMatch(
      /\.world-management__(?:hero-actions button\.is-primary,[\s\S]*?|hero-copy button)\s*\{[^}]*background:\s*var\(--neko-button-background/u,
    );
    expect(style).toMatch(
      /\.world-management__(?:hero-actions|hero-copy) button,[\s\S]*?\{[^}]*color:\s*var\(--neko-button-secondaryForeground/u,
    );
    expect(style).toMatch(
      /\.world-management__world-card-copy p\s*\{[^}]*color:\s*var\(--neko-fg-secondary/u,
    );
  });
});
