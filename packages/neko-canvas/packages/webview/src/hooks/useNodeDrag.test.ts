// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { getNodeDragStartDecision, shouldStartNodeDrag } from './useNodeDrag';

describe('shouldStartNodeDrag', () => {
  it('allows non-left buttons to bubble to viewport pan gestures', () => {
    const target = document.createElement('div');

    expect(getNodeDragStartDecision(mouseDown(target, 10, 10, 2))).toEqual({
      canStart: false,
      stopPropagation: false,
    });
  });

  it('allows dragging from ordinary node chrome', () => {
    const target = document.createElement('div');
    Object.defineProperty(target, 'clientWidth', { value: 200 });
    Object.defineProperty(target, 'scrollWidth', { value: 200 });
    Object.defineProperty(target, 'clientHeight', { value: 120 });
    Object.defineProperty(target, 'scrollHeight', { value: 120 });
    target.getBoundingClientRect = () => createRect(0, 0, 200, 120);

    expect(shouldStartNodeDrag(mouseDown(target, 80, 40))).toBe(true);
    expect(getNodeDragStartDecision(mouseDown(target, 80, 40))).toEqual({
      canStart: true,
      stopPropagation: false,
    });
  });

  it('blocks dragging from interactive controls', () => {
    const button = document.createElement('button');

    expect(shouldStartNodeDrag(mouseDown(button, 10, 10))).toBe(false);
    expect(getNodeDragStartDecision(mouseDown(button, 10, 10))).toEqual({
      canStart: false,
      stopPropagation: true,
    });
  });

  it('blocks dragging from explicit node drag block regions', () => {
    const blocked = document.createElement('div');
    blocked.dataset.nodeDragBlock = 'true';
    const child = document.createElement('span');
    blocked.appendChild(child);

    expect(shouldStartNodeDrag(mouseDown(child, 10, 10))).toBe(false);
    expect(getNodeDragStartDecision(mouseDown(child, 10, 10))).toEqual({
      canStart: false,
      stopPropagation: true,
    });
  });

  it('keeps content draggable while preserving explicit interaction ownership', () => {
    const content = document.createElement('div');
    const ordinaryMaterial = document.createElement('span');
    const button = document.createElement('button');
    const complexSurface = document.createElement('div');
    complexSurface.dataset.nodeDragBlock = 'true';
    const complexSurfaceChild = document.createElement('span');
    complexSurface.appendChild(complexSurfaceChild);
    content.append(ordinaryMaterial, button, complexSurface);

    expect(getNodeDragStartDecision(mouseDown(ordinaryMaterial, 10, 10))).toEqual({
      canStart: true,
      stopPropagation: false,
    });
    expect(getNodeDragStartDecision(mouseDown(button, 10, 10))).toEqual({
      canStart: false,
      stopPropagation: true,
    });
    expect(getNodeDragStartDecision(mouseDown(complexSurfaceChild, 10, 10))).toEqual({
      canStart: false,
      stopPropagation: true,
    });
  });

  it('allows an explicitly eligible keyboard control to remain Group drag chrome', () => {
    const name = document.createElement('span');
    name.setAttribute('role', 'button');
    name.dataset.nodeDragAllow = 'true';

    expect(getNodeDragStartDecision(mouseDown(name, 10, 10))).toEqual({
      canStart: true,
      stopPropagation: false,
    });
  });

  it('blocks dragging from horizontal scrollbar hit areas', () => {
    const scroller = document.createElement('div');
    Object.defineProperty(scroller, 'clientWidth', { value: 200 });
    Object.defineProperty(scroller, 'scrollWidth', { value: 500 });
    Object.defineProperty(scroller, 'clientHeight', { value: 100 });
    Object.defineProperty(scroller, 'scrollHeight', { value: 100 });
    scroller.getBoundingClientRect = () => createRect(0, 0, 200, 100);
    const child = document.createElement('span');
    scroller.appendChild(child);

    expect(shouldStartNodeDrag(mouseDown(child, 80, 96))).toBe(false);
    expect(getNodeDragStartDecision(mouseDown(child, 80, 96))).toEqual({
      canStart: false,
      stopPropagation: true,
    });
  });

  it('blocks dragging from vertical scrollbar hit areas', () => {
    const scroller = document.createElement('div');
    Object.defineProperty(scroller, 'clientWidth', { value: 200 });
    Object.defineProperty(scroller, 'scrollWidth', { value: 200 });
    Object.defineProperty(scroller, 'clientHeight', { value: 100 });
    Object.defineProperty(scroller, 'scrollHeight', { value: 300 });
    scroller.getBoundingClientRect = () => createRect(0, 0, 200, 100);
    const child = document.createElement('span');
    scroller.appendChild(child);

    expect(shouldStartNodeDrag(mouseDown(child, 196, 40))).toBe(false);
    expect(getNodeDragStartDecision(mouseDown(child, 196, 40))).toEqual({
      canStart: false,
      stopPropagation: true,
    });
  });
});

function mouseDown(target: Element, clientX: number, clientY: number, button = 0): MouseEvent {
  const event = new MouseEvent('mousedown', {
    bubbles: true,
    button,
    clientX,
    clientY,
  });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

function createRect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
    toJSON: () => ({}),
  };
}
