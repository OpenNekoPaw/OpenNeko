import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('TUI debug automation boundary', () => {
  it('does not recreate the removed headless Agent path', () => {
    const files = ['session-manager.tsx', 'app-port.ts', 'stdio.ts', 'protocol.ts'];
    const sources = files.map((file) =>
      fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'),
    );

    for (const source of sources) {
      expect(source).not.toContain('runAgent');
      expect(source).not.toContain('headless-session');
      expect(source).not.toContain('core/eval');
      expect(source).not.toContain('createAgentRuntimeSession');
      expect(source).not.toContain('session.execute(');
    }
  });
});
