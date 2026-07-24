import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));

import { readCommand } from './CutOtioEditorProvider';

describe('Cut OTIO command bridge', () => {
  it('accepts the explicit trailing-Gap trim command', () => {
    expect(readCommand({ type: 'trim-trailing-gaps' })).toEqual({
      type: 'trim-trailing-gaps',
    });
  });
});
