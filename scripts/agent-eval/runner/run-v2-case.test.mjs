import { describe, expect, it } from 'vitest';
import { runV2Case } from './run-v2-case.mjs';

describe('Desktop Agent evaluation driver boundary', () => {
  it('fails visibly while the Desktop complete-session driver is unavailable', async () => {
    await expect(runV2Case()).rejects.toMatchObject({
      code: 'infrastructure-blocked',
      message: expect.stringContaining('Desktop application'),
    });
  });
});
