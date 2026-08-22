import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(__dirname, '../../../../../..');

describe('retired multimodal perception architecture boundary guard', () => {
  it('keeps the retired shared multimodal contract graph deleted', () => {
    const files = [
      join(REPO_ROOT, 'packages/agent/contracts/src/perception-card.ts'),
      join(REPO_ROOT, 'packages/agent/contracts/src/tool.ts'),
      join(REPO_ROOT, 'packages/agent/contracts/src/provider-card.ts'),
      join(REPO_ROOT, 'packages/agent/contracts/src/message.ts'),
    ];

    for (const file of files) {
      expect(existsSync(file), relative(REPO_ROOT, file)).toBe(false);
    }
  });

  it('keeps the retired runtime multimodal projection graph deleted', () => {
    for (const file of [
      'packages/agent/runtime/src/provider/multimodal-message-projection.ts',
      'packages/agent/runtime/src/runtime/turn/multimodal-context-packet.ts',
    ]) {
      expect(existsSync(join(REPO_ROOT, file)), file).toBe(false);
    }
  });
});
