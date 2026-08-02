const EDITABLE_TARGET_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable]',
  '[role="textbox"]',
  '[data-neko-keyboard-scope="text-input"]',
].join(',');

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  const element = target.closest(EDITABLE_TARGET_SELECTOR);
  if (!element) {
    return false;
  }

  if (element instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(element.type);
  }

  if (element instanceof HTMLElement && element.isContentEditable) {
    return true;
  }

  const contentEditable = element.getAttribute('contenteditable');
  if (contentEditable !== null) {
    return contentEditable.toLowerCase() !== 'false';
  }

  return (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element.getAttribute('role') === 'textbox' ||
    element.getAttribute('data-neko-keyboard-scope') === 'text-input'
  );
}

export function hasEditableActiveElement(
  root: Document | ShadowRoot | null = typeof document === 'undefined' ? null : document,
): boolean {
  return isEditableTarget(root?.activeElement ?? null);
}

export function isComposingKeyboardEvent(event: KeyboardEvent): boolean {
  const imeCompositionKeyCode = 'keyCode' in event ? event.keyCode : undefined;
  return event.isComposing || imeCompositionKeyCode === 229;
}
