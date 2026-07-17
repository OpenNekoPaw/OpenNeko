export interface ClassTokenAssertion {
  readonly className: string;
  readonly forbiddenPrefixes?: readonly string[];
}

export {
  findInlineSvgControlViolations,
  findPackageSpecificTokenViolations,
  findSharedComponentsImportViolations,
} from './source-guards';
export type { SharedComponentsImportAllowance, SourceGuardViolation } from './source-guards';

export function hasAccessibleName(element: Element): boolean {
  const ariaLabel = element.getAttribute('aria-label');
  const labelledBy = element.getAttribute('aria-labelledby');
  const title = element.getAttribute('title');
  const text = element.textContent?.trim();

  return Boolean(ariaLabel || labelledBy || title || text);
}

export function getFocusableElements(root: ParentNode): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled') && element.tabIndex >= 0);
}

export function assertNoForbiddenClassPrefixes({
  className,
  forbiddenPrefixes = ['nk-', 'sketch-', 'model-', 'tools-'],
}: ClassTokenAssertion): void {
  const tokens = className.split(/\s+/).filter(Boolean);
  const forbidden = tokens.find((token) =>
    forbiddenPrefixes.some((prefix) => token.startsWith(prefix) || token.includes(`--${prefix}`)),
  );

  if (forbidden) {
    throw new Error(`Forbidden package-specific UI token: ${forbidden}`);
  }
}
