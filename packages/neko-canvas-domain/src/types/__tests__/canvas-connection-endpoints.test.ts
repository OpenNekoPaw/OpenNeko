import { describe, expect, it } from 'vitest';
import { getDefaultPorts } from '../canvas';

describe('Canvas playable node connection endpoints', () => {
  it.each(['markdown', 'media'] as const)(
    'provides incoming and outgoing sequence endpoints for %s nodes',
    (nodeType) => {
      expect(getDefaultPorts(nodeType)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'in', type: 'input', position: 'left' }),
          expect.objectContaining({ id: 'out', type: 'output', position: 'right' }),
        ]),
      );
    },
  );

  it('retains the existing Media out endpoint identity', () => {
    expect(getDefaultPorts('media').find((port) => port.id === 'out')).toMatchObject({
      type: 'output',
      position: 'right',
      dataType: 'any',
    });
  });
});
