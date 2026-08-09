import { CheckIcon, LoadingIcon, WarningIcon } from '@neko/ui';
import type { FormEvent, ReactNode } from 'react';

export function createDomainIdentity(prefix: string): string {
  return `${prefix}:${globalThis.crypto.randomUUID()}`;
}

export function lines(value: string): readonly string[] {
  return value
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function FoundationField({
  children,
  hint,
  label,
}: {
  readonly children: ReactNode;
  readonly hint?: string;
  readonly label: string;
}): JSX.Element {
  return (
    <label className="character-foundation__field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function FoundationSegmented<T extends string>({
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  readonly disabled?: boolean;
  readonly label: string;
  readonly onChange?: (value: T) => void;
  readonly options: readonly { readonly label: string; readonly value: T }[];
  readonly value: T;
}): JSX.Element {
  return (
    <div className="character-foundation__segmented" aria-label={label} role="group">
      {options.map((option) => (
        <button
          aria-pressed={value === option.value}
          disabled={disabled}
          key={option.value}
          type="button"
          onClick={onChange ? () => onChange(option.value) : undefined}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function FoundationSubmit({
  children,
  disabled,
  pending,
}: {
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly pending: boolean;
}): JSX.Element {
  return (
    <button
      className="character-foundation__primary-command"
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? <LoadingIcon size={15} /> : <CheckIcon size={15} />}
      <span>{children}</span>
    </button>
  );
}

export function FoundationEmpty({ children }: { readonly children: ReactNode }): JSX.Element {
  return <div className="character-foundation__empty">{children}</div>;
}

export function FoundationDiagnostic({
  children,
  role = 'status',
}: {
  readonly children: ReactNode;
  readonly role?: 'alert' | 'status';
}): JSX.Element {
  return (
    <div className="character-foundation__diagnostic" role={role}>
      <WarningIcon size={16} />
      <span>{children}</span>
    </div>
  );
}

export function submitForm(
  event: FormEvent<HTMLFormElement>,
  submit: () => void | Promise<void>,
): void {
  event.preventDefault();
  void Promise.resolve(submit()).catch(() => undefined);
}
