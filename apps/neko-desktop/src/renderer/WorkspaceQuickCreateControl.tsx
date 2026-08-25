import { EditIcon, FileIcon, FolderIcon, GridIcon, IconButton, PlusIcon, Popover } from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { WorkspaceQuickCreateKind } from './desktop-workspace-quick-creation';

export interface WorkspaceQuickCreateSubmission {
  readonly kind: WorkspaceQuickCreateKind;
  readonly name: string;
}

export function WorkspaceQuickCreateControl({
  disabled = false,
  onCreate,
  variant,
}: {
  readonly disabled?: boolean;
  readonly onCreate: (submission: WorkspaceQuickCreateSubmission) => Promise<void>;
  readonly variant: 'tab' | 'empty';
}): JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<WorkspaceQuickCreateKind>();
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [diagnostic, setDiagnostic] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const extensionId = useId();
  const extension = kind === 'canvas' ? '.nkc' : kind === 'cut' ? '.otio' : undefined;

  useEffect(() => {
    if (kind) inputRef.current?.focus();
  }, [kind]);

  const reset = (): void => {
    setKind(undefined);
    setName('');
    setDiagnostic(undefined);
  };
  const setPopoverOpen = (next: boolean): void => {
    if (pending && !next) return;
    setOpen(next);
    if (!next) reset();
  };
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!kind) throw new Error('Workspace quick creation kind is missing.');
    const requestedName = name.trim();
    if (!requestedName) {
      setDiagnostic(t('workspace.quickCreate.nameRequired'));
      return;
    }
    setPending(true);
    setDiagnostic(undefined);
    try {
      await onCreate({ kind, name: requestedName });
      setOpen(false);
      reset();
    } catch (error: unknown) {
      setDiagnostic(describeError(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <Popover
      align={variant === 'tab' ? 'start' : 'center'}
      contentClassName="workspace-quick-create-popover"
      onOpenChange={setPopoverOpen}
      open={open}
      trigger={
        variant === 'tab' ? (
          <IconButton
            className="workspace-main-quick-create__tab-trigger"
            data-workspace-quick-create-trigger="tab"
            disabled={disabled}
            icon={<PlusIcon size={15} />}
            label={t('workspace.quickCreate.open')}
            size="xs"
            title={t('workspace.quickCreate.open')}
          />
        ) : (
          <button
            className="workspace-main-quick-create__empty-trigger"
            data-workspace-quick-create-trigger="empty"
            disabled={disabled}
            type="button"
          >
            <PlusIcon size={15} />
            <span>{t('workspace.quickCreate.open')}</span>
          </button>
        )
      }
    >
      {kind ? (
        <form
          className="workspace-quick-create-popover__form"
          onSubmit={(event) => void submit(event)}
        >
          <header>
            <strong>{quickCreateKindLabel(kind, t)}</strong>
            <span>{t('workspace.quickCreate.targetRoot')}</span>
          </header>
          <label className="workspace-quick-create-popover__name">
            <span>{t('workspace.quickCreate.name')}</span>
            <span className="workspace-quick-create-popover__name-field">
              <input
                ref={inputRef}
                aria-describedby={extension ? extensionId : undefined}
                aria-label={t('workspace.quickCreate.name')}
                autoComplete="off"
                disabled={pending}
                value={name}
                onChange={(event) => {
                  setName(event.currentTarget.value);
                  setDiagnostic(undefined);
                }}
              />
              {extension ? <span id={extensionId}>{extension}</span> : null}
            </span>
          </label>
          {diagnostic ? (
            <p className="workspace-quick-create-popover__diagnostic" role="alert">
              {diagnostic}
            </p>
          ) : null}
          <footer>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setKind(undefined);
                setName('');
                setDiagnostic(undefined);
              }}
            >
              {t('workspace.quickCreate.back')}
            </button>
            <button type="submit" disabled={pending}>
              {pending ? t('workspace.quickCreate.creating') : t('workspace.quickCreate.create')}
            </button>
          </footer>
        </form>
      ) : (
        <div
          className="workspace-quick-create-popover__menu"
          role="menu"
          aria-label={t('workspace.quickCreate.open')}
        >
          <span className="workspace-quick-create-popover__target" role="presentation">
            {t('workspace.quickCreate.targetRoot')}
          </span>
          {(['canvas', 'cut', 'file', 'directory'] as const).map((candidate) => (
            <button
              key={candidate}
              data-workspace-quick-create-kind={candidate}
              role="menuitem"
              type="button"
              onClick={() => {
                setKind(candidate);
                setDiagnostic(undefined);
              }}
            >
              {quickCreateKindIcon(candidate)}
              <span>{quickCreateKindLabel(candidate, t)}</span>
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

function quickCreateKindIcon(kind: WorkspaceQuickCreateKind): JSX.Element {
  if (kind === 'canvas') return <GridIcon size={14} aria-hidden="true" />;
  if (kind === 'cut') return <EditIcon size={14} aria-hidden="true" />;
  if (kind === 'directory') return <FolderIcon size={14} aria-hidden="true" />;
  return <FileIcon size={14} aria-hidden="true" />;
}

function quickCreateKindLabel(
  kind: WorkspaceQuickCreateKind,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (kind === 'canvas') return t('workspace.quickCreate.canvas');
  if (kind === 'cut') return t('workspace.quickCreate.cut');
  if (kind === 'directory') return t('workspace.quickCreate.directory');
  return t('workspace.quickCreate.file');
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
