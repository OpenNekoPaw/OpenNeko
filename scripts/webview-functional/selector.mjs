const NATIVE_ROLE_SELECTORS = Object.freeze({
  button: 'button,[role="button"]',
  checkbox: 'input[type="checkbox"],[role="checkbox"]',
  combobox: 'select,[role="combobox"]',
  link: 'a[href],[role="link"]',
  textbox: 'input:not([type]),input[type="text"],input[type="search"],textarea,[contenteditable="true"],[role="textbox"]',
});

export function createSelectorExpression(selector) {
  const serialized = JSON.stringify(selector);
  const roleSelectors = JSON.stringify(NATIVE_ROLE_SELECTORS);
  return `(() => {
    const selector = ${serialized};
    const nativeRoles = ${roleSelectors};
    const elements = selector.testId
      ? [...document.querySelectorAll('[data-testid]')].filter((element) => element.getAttribute('data-testid') === selector.testId)
      : selector.css
        ? [...document.querySelectorAll(selector.css)]
        : [...document.querySelectorAll(nativeRoles[selector.role] || '[role="' + CSS.escape(selector.role) + '"]')];
    const normalizedName = selector.name?.trim().toLowerCase();
    const matched = normalizedName
      ? elements.filter((element) => {
          const accessibleName = (
            element.getAttribute('aria-label') ||
            element.getAttribute('title') ||
            element.getAttribute('placeholder') ||
            element.textContent ||
            ''
          ).trim().toLowerCase();
          return accessibleName === normalizedName || accessibleName.includes(normalizedName);
        })
      : elements;
    return matched[0] || null;
  })()`;
}

export function createElementStateExpression(selector, state) {
  const elementExpression = createSelectorExpression(selector);
  const serializedState = JSON.stringify(state);
  return `(() => {
    const element = ${elementExpression};
    const state = ${serializedState};
    if (state.kind === 'hidden') return !element || getComputedStyle(element).display === 'none' || getComputedStyle(element).visibility === 'hidden';
    if (!element) return false;
    const style = getComputedStyle(element);
    const visible = style.display !== 'none' && style.visibility !== 'hidden' && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
    if (state.kind === 'visible') return visible;
    if (state.kind === 'enabled') return !element.disabled && element.getAttribute('aria-disabled') !== 'true';
    if (state.kind === 'text') return (element.textContent || '').includes(state.value);
    if (state.kind === 'value') return String(element.value ?? element.getAttribute('value') ?? '') === state.value;
    return false;
  })()`;
}
