/**
 * SVG icons for ToolCallDisplay components
 * Also reusable by TaskCard and other tool-related UI
 */

export { FileIcon, WarningIcon } from '@neko/shared/icons';
export { ChevronDownIcon as ChevronIcon } from '@neko/shared/icons';
// SuccessIcon renders as a checkmark — reuse CheckIcon from shared
export { CheckIcon as SuccessIcon } from '@neko/shared/icons';

// X cross used as error status indicator (different from shared ErrorIcon which is circle+X)
export function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// Circular animated spinner with animate-spin (different from shared LoadingIcon)
export function ToolLoadingSpinner({ className }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
