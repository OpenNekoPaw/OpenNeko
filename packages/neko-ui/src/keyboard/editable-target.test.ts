import { describe, expect, it } from 'vitest';
import {
  hasEditableActiveElement,
  isComposingKeyboardEvent,
  isEditableTarget,
} from './editable-target';

describe('keyboard editable and IME guards', () => {
  it('treats text inputs, textareas, selects, textbox roles, contenteditable, and text-input scopes as editable', () => {
    document.body.innerHTML = `
      <input id="text" />
      <textarea id="textarea"></textarea>
      <select id="select"></select>
      <div id="editable" contenteditable="true"><span id="nested"></span></div>
      <div id="role" role="textbox"></div>
      <div data-neko-keyboard-scope="text-input"><span id="scoped"></span></div>
    `;

    expect(isEditableTarget(document.getElementById('text'))).toBe(true);
    expect(isEditableTarget(document.getElementById('textarea'))).toBe(true);
    expect(isEditableTarget(document.getElementById('select'))).toBe(true);
    expect(isEditableTarget(document.getElementById('nested'))).toBe(true);
    expect(isEditableTarget(document.getElementById('role'))).toBe(true);
    expect(isEditableTarget(document.getElementById('scoped'))).toBe(true);
  });

  it('does not treat button-like inputs as editable text targets', () => {
    document.body.innerHTML = `
      <input id="range" type="range" />
      <input id="checkbox" type="checkbox" />
      <button id="button"></button>
    `;

    expect(isEditableTarget(document.getElementById('range'))).toBe(false);
    expect(isEditableTarget(document.getElementById('checkbox'))).toBe(false);
    expect(isEditableTarget(document.getElementById('button'))).toBe(false);
  });

  it('covers Agent and Sketch legacy editable target selectors', () => {
    document.body.innerHTML = `
      <div id="contenteditable-empty" contenteditable=""><span id="empty-child"></span></div>
      <div id="contenteditable-true" contenteditable="true"><span id="true-child"></span></div>
      <div id="contenteditable-false" contenteditable="false"><span id="false-child"></span></div>
      <div id="role-textbox" role="textbox"><span id="role-child"></span></div>
      <div id="neko-text-input" data-neko-keyboard-scope="text-input">
        <span id="scope-child"></span>
      </div>
    `;

    expect(isEditableTarget(document.getElementById('empty-child'))).toBe(true);
    expect(isEditableTarget(document.getElementById('true-child'))).toBe(true);
    expect(isEditableTarget(document.getElementById('false-child'))).toBe(false);
    expect(isEditableTarget(document.getElementById('role-child'))).toBe(true);
    expect(isEditableTarget(document.getElementById('scope-child'))).toBe(true);
  });

  it('detects when the current active element is editable', () => {
    document.body.innerHTML = `
      <input id="text" />
      <button id="button"></button>
    `;

    document.getElementById('text')?.focus();
    expect(hasEditableActiveElement()).toBe(true);

    document.getElementById('button')?.focus();
    expect(hasEditableActiveElement()).toBe(false);
  });

  it('detects active IME composition events', () => {
    expect(
      isComposingKeyboardEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true })),
    ).toBe(true);
    expect(
      isComposingKeyboardEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229 })),
    ).toBe(true);
  });
});
