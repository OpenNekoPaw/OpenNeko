import { setTimeout as delay } from 'node:timers/promises';
import { createElementStateExpression, createSelectorExpression } from './selector.mjs';

export async function runStep(step, context) {
  const timeoutMs = step.timeoutMs ?? context.defaultTimeoutMs;
  switch (step.operation) {
    case 'wait-visible':
      return waitForState(context.webview, step.selector, { kind: 'visible' }, timeoutMs);
    case 'wait-state':
      return waitForState(context.webview, step.selector, step.state, timeoutMs);
    case 'click':
      return clickElement(context.webview, step.selector);
    case 'drag':
      return dragElement(context.webview, step.selector, step.delta);
    case 'input':
      return inputValue(context.webview, step.selector, step.value);
    case 'select':
      return selectValue(context.webview, step.selector, step.value);
    case 'key':
      if (!(await context.webview.hasDocumentFocus())) {
        await context.keyboard.focusFrame(context.webview.target.id);
        await context.webview.focusFrame(context.webview.documentFrameId);
      }
      return context.webview.dispatchKey(step.key);
    case 'host-command':
      return context.host.execute('execute-command', {
        command: step.command,
        args: step.args ?? [],
      });
    case 'open-file':
      return context.host.execute('open-file', { path: step.path });
    case 'read-workspace':
      return context.host.execute('read-workspace', { path: step.path });
    case 'read-diagnostics':
      return context.host.execute('read-diagnostics', { path: step.path });
    case 'save':
      return context.host.execute('save-active', {});
    case 'reload':
      return context.host.execute('reload-window', {});
    case 'hide-reveal':
      return context.host.execute('hide-reveal', {});
    case 'close-reopen':
      return context.host.execute('close-reopen', { path: step.path, viewType: step.viewType });
    case 'screenshot':
      return context.captureScreenshot(step.screenshotName ?? step.id);
    default:
      throw new Error(`Unsupported operation after validation: ${step.operation}`);
  }
}

export async function waitForState(session, selector, state, timeoutMs) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await session.evaluate(createElementStateExpression(selector, state))) {
        return { state, elapsedMs: Date.now() - startedAt };
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  const error = new Error(
    `Timed out waiting for state ${JSON.stringify(state)} on ${JSON.stringify(selector)}: ${lastError?.message ?? 'not matched'}`,
  );
  error.failureClassification = 'test-case';
  throw error;
}

async function interact(session, selector, body) {
  const elementExpression = createSelectorExpression(selector);
  const result = await session.evaluate(
    `(() => { const element = ${elementExpression}; if (!element) return false; ${body} })()`,
  );
  if (result !== true) {
    throw new Error(`Element not found for selector ${JSON.stringify(selector)}`);
  }
  return { interacted: true };
}

async function clickElement(session, selector) {
  const target = await resolveInteractionTarget(session, selector);
  await session.dispatchClick(target.x, target.y);
  const elementExpression = createSelectorExpression(selector);
  await session.evaluate(`(() => {
    const element = ${elementExpression};
    if (!(element instanceof HTMLElement)) return false;
    element.focus({ preventScroll: true });
    return true;
  })()`);
  return { interacted: true };
}

async function dragElement(session, selector, delta) {
  const target = await resolveInteractionTarget(session, selector);
  const destination = { x: target.x + delta.x, y: target.y + delta.y };
  await session.dispatchDrag(target, destination);
  return { interacted: true, origin: target, destination };
}

async function inputValue(session, selector, value) {
  const elementExpression = createSelectorExpression(selector);
  const target = await resolveInteractionTarget(session, selector);
  await session.dispatchClick(target.x, target.y);
  const elementKind = await session.evaluate(
    `(() => {
      const element = ${elementExpression};
      if (!element) return 'missing';
      element.focus();
      if (element.isContentEditable) {
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        return 'contenteditable';
      }
      if (typeof element.select === 'function') element.select();
      return 'text-input';
    })()`,
  );
  if (elementKind === 'contenteditable' || elementKind === 'text-input') {
    await session.send('Input.insertText', { text: value });
    return { interacted: true, inputKind: elementKind };
  }
  throw new Error(`Element not found for selector ${JSON.stringify(selector)}`);
}

async function resolveInteractionTarget(session, selector) {
  const elementExpression = createSelectorExpression(selector);
  const target = await session.evaluate(
    `(() => {
      const element = ${elementExpression};
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`,
  );
  if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
    throw new Error(
      `Visible interaction target not found for selector ${JSON.stringify(selector)}`,
    );
  }
  return target;
}

async function selectValue(session, selector, value) {
  const serializedValue = JSON.stringify(value);
  return interact(
    session,
    selector,
    `element.focus(); element.value = ${serializedValue}; element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); return element.value === ${serializedValue};`,
  );
}
