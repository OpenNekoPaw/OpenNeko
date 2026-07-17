import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import {
  KEYBOARD_FOCUSED_ATTRIBUTE,
  KEYBOARD_SCOPE_ATTRIBUTE,
  setKeyboardFocusedAttribute,
} from './boundary';
import { isEditableTarget } from './editable-target';

export interface WebviewKeyboardFocusMessage {
  readonly type: 'webviewKeyboardFocus';
  readonly focused: boolean;
}

export interface WebviewKeyboardFocusReporter {
  readonly postMessage: (message: WebviewKeyboardFocusMessage) => void;
}

export interface WebviewKeyboardEditableMessage {
  readonly type: 'webviewKeyboardEditable';
  readonly editable: boolean;
}

export interface WebviewKeyboardEditableReporter {
  readonly postMessage: (message: WebviewKeyboardEditableMessage) => void;
}

export interface KeyboardFocusMessage {
  readonly type: 'keyboardFocus';
  readonly focused: boolean;
}

export function isKeyboardFocusMessage(value: unknown): value is KeyboardFocusMessage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as { type?: unknown; focused?: unknown };
  return candidate.type === 'keyboardFocus' && typeof candidate.focused === 'boolean';
}

export function useReportWebviewKeyboardFocus<T extends HTMLElement>(
  _rootRef: React.RefObject<T | null>,
  reporter: WebviewKeyboardFocusReporter | null | undefined,
): void {
  const focusedRef = useRef<boolean | null>(null);
  const reporterRef = useLatestRef(reporter);
  const hasReporter = reporter !== null && reporter !== undefined;

  useEffect(() => {
    if (!reporter) {
      return;
    }

    const report = (focused: boolean): void => {
      if (focusedRef.current === focused) {
        return;
      }
      focusedRef.current = focused;
      reporterRef.current?.postMessage({ type: 'webviewKeyboardFocus', focused });
    };
    const forceReportFocused = (): void => {
      focusedRef.current = true;
      reporterRef.current?.postMessage({ type: 'webviewKeyboardFocus', focused: true });
    };

    const handleFocusIn = (): void => report(true);
    const handlePointerDown = (): void => forceReportFocused();
    const handleWindowFocus = (): void => {
      if (document.hasFocus()) {
        report(true);
      }
    };
    const handleWindowBlur = (): void => report(false);
    const handlePageHide = (): void => report(false);
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        report(false);
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('pointerdown', handlePointerDown, { capture: true });
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (document.hasFocus()) {
      report(true);
    }

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      report(false);
    };
  }, [hasReporter]);
}

export function useReportWebviewKeyboardEditable(
  reporter: WebviewKeyboardEditableReporter | null | undefined,
): void {
  const editableRef = useRef<boolean | null>(null);
  const reporterRef = useLatestRef(reporter);
  const hasReporter = reporter !== null && reporter !== undefined;

  useEffect(() => {
    if (!reporter) {
      return;
    }
    let windowFocused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
    let focusOutTimer: number | null = null;
    let editableReleaseTimer: number | null = null;

    const report = (editable: boolean): void => {
      if (editableRef.current === editable) {
        return;
      }
      editableRef.current = editable;
      reporterRef.current?.postMessage({ type: 'webviewKeyboardEditable', editable });
    };

    const reportActiveElement = (): void => {
      report(windowFocused && isEditableTarget(document.activeElement));
    };

    const clearFocusOutTimer = (): void => {
      if (focusOutTimer === null) {
        return;
      }
      window.clearTimeout(focusOutTimer);
      focusOutTimer = null;
    };
    const clearEditableReleaseTimer = (): void => {
      if (editableReleaseTimer === null) {
        return;
      }
      window.clearTimeout(editableReleaseTimer);
      editableReleaseTimer = null;
    };

    const handleFocusIn = (): void => {
      clearFocusOutTimer();
      windowFocused = true;
      reportActiveElement();
    };
    const handleFocusOut = (): void => {
      clearFocusOutTimer();
      focusOutTimer = window.setTimeout(() => {
        focusOutTimer = null;
        reportActiveElement();
      }, 0);
    };
    const handlePointerDown = (event: PointerEvent): void => {
      clearFocusOutTimer();
      clearEditableReleaseTimer();
      windowFocused = true;
      report(isEditableTarget(event.target));
      const targetElement = getPointerTargetElement(event.target);
      if (targetElement) {
        editableReleaseTimer = window.setTimeout(() => {
          editableReleaseTimer = null;
          releaseEditableFocusFromPointerTarget(targetElement, null);
        }, 0);
      }
    };
    const handleWindowFocus = (): void => {
      clearFocusOutTimer();
      clearEditableReleaseTimer();
      windowFocused = true;
      reportActiveElement();
    };
    const handleWindowBlur = (): void => {
      clearFocusOutTimer();
      clearEditableReleaseTimer();
      windowFocused = false;
      report(false);
    };
    const handlePageHide = (): void => {
      clearFocusOutTimer();
      clearEditableReleaseTimer();
      report(false);
    };
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        clearFocusOutTimer();
        clearEditableReleaseTimer();
        report(false);
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    document.addEventListener('pointerdown', handlePointerDown, { capture: true });
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    reportActiveElement();

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearFocusOutTimer();
      clearEditableReleaseTimer();
      report(false);
    };
  }, [hasReporter]);
}

function useLatestRef<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function useFocusedWebviewRoot<T extends HTMLElement>(
  rootRef: React.RefObject<T | null>,
  defaultFocused = true,
): {
  readonly isKeyboardFocused: boolean;
  readonly isKeyboardFocusedRef: React.MutableRefObject<boolean>;
  readonly setKeyboardFocused: (focused: boolean) => void;
} {
  const [isKeyboardFocused, setKeyboardFocusedState] = useState(defaultFocused);
  const isKeyboardFocusedRef = useRef(defaultFocused);

  const setKeyboardFocused = (focused: boolean): void => {
    isKeyboardFocusedRef.current = focused;
    setKeyboardFocusedState(focused);
    const root = rootRef.current;
    if (root) {
      setKeyboardFocusedAttribute(root, focused);
    }
    setBodyKeyboardFocusedAttribute(focused);
  };

  useEffect(() => {
    const root = rootRef.current;

    const markFocused = (): void => setKeyboardFocused(true);
    const markBlurred = (): void => setKeyboardFocused(false);
    const handlePointerDown = (event: PointerEvent): void => {
      markFocused();
      releaseEditableFocusFromPointerTarget(getPointerTargetElement(event.target), root);
    };
    const handleWindowFocus = (): void => {
      if (document.hasFocus()) {
        markFocused();
      }
    };
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        markBlurred();
      }
    };

    root?.addEventListener('focusin', markFocused);
    root?.addEventListener('pointerdown', handlePointerDown, { capture: true });
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', markBlurred);
    window.addEventListener('pagehide', markBlurred);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      root?.removeEventListener('focusin', markFocused);
      root?.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', markBlurred);
      window.removeEventListener('pagehide', markBlurred);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [rootRef]);

  useEffect(() => {
    const root = rootRef.current;
    if (root) {
      setKeyboardFocusedAttribute(root, isKeyboardFocusedRef.current);
    }
    setBodyKeyboardFocusedAttribute(isKeyboardFocusedRef.current);

    return () => {
      document.body.removeAttribute(KEYBOARD_FOCUSED_ATTRIBUTE);
    };
  }, [rootRef]);

  return {
    isKeyboardFocused,
    isKeyboardFocusedRef,
    setKeyboardFocused,
  };
}

function setBodyKeyboardFocusedAttribute(focused: boolean): void {
  if (typeof document === 'undefined') {
    return;
  }

  setKeyboardFocusedAttribute(document.body, focused);
}

function releaseEditableFocusFromPointerTarget(
  targetElement: Element | null,
  root: HTMLElement | null,
): void {
  if (!(document.activeElement instanceof HTMLElement)) {
    return;
  }

  const activeElement = document.activeElement;
  if (!isEditableTarget(activeElement) || !targetElement) {
    return;
  }

  if (activeElement.contains(targetElement) || isEditableTarget(targetElement)) {
    return;
  }

  if (hasBrowserManagedPointerFocusTarget(targetElement)) {
    return;
  }

  const focusTarget = root ? findKeyboardFocusTransferTarget(targetElement, root) : null;
  focusTarget?.focus({ preventScroll: true });

  if (document.activeElement === activeElement) {
    activeElement.blur();
  }
}

function findKeyboardFocusTransferTarget(
  targetElement: Element,
  root: HTMLElement,
): HTMLElement | null {
  let current: Element | null = targetElement;

  while (current && root.contains(current)) {
    if (
      current instanceof HTMLElement &&
      current.hasAttribute(KEYBOARD_SCOPE_ATTRIBUTE) &&
      canProgrammaticallyFocus(current)
    ) {
      return current;
    }
    current = current.parentElement;
  }

  return canProgrammaticallyFocus(root) ? root : null;
}

function getPointerTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }

  if (target instanceof Node) {
    return target.parentElement;
  }

  return null;
}

function hasBrowserManagedPointerFocusTarget(targetElement: Element): boolean {
  return Boolean(
    targetElement.closest(
      [
        'a[href]',
        'area[href]',
        'button',
        'input',
        'select',
        'textarea',
        'summary',
        'iframe',
        'object',
        'embed',
        'label',
        '[contenteditable]:not([contenteditable="false"])',
      ].join(','),
    ),
  );
}

function canProgrammaticallyFocus(element: HTMLElement): boolean {
  if (element.matches('[disabled], [inert], [aria-disabled="true"]')) {
    return false;
  }

  return (
    element.hasAttribute('tabindex') ||
    element.isContentEditable ||
    element.matches(
      [
        'a[href]',
        'area[href]',
        'button',
        'input',
        'select',
        'textarea',
        'summary',
        'iframe',
        'object',
        'embed',
      ].join(','),
    )
  );
}
