// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ShapeRenderer } from './ShapeRenderer';
import { createRectangleShape, createShapeInstance } from '../types/shape';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('ShapeRenderer Hook lifecycle', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('preserves Hook order while visibility changes', () => {
    const shape = createShapeInstance(createRectangleShape(), 'Rectangle');

    act(() => {
      root.render(
        <svg>
          <ShapeRenderer shape={{ ...shape, visible: false }} width={640} height={360} />
        </svg>,
      );
    });
    expect(host.querySelector('.shape-instance')).toBeNull();

    act(() => {
      root.render(
        <svg>
          <ShapeRenderer shape={{ ...shape, visible: true }} width={640} height={360} />
        </svg>,
      );
    });
    expect(host.querySelector('.shape-instance')).not.toBeNull();

    act(() => {
      root.render(
        <svg>
          <ShapeRenderer shape={{ ...shape, visible: false }} width={640} height={360} />
        </svg>,
      );
    });
    expect(host.querySelector('.shape-instance')).toBeNull();
  });
});
