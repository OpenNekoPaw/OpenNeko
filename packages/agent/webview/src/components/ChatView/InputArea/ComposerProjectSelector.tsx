import { useRef, useState } from 'react';
import { FolderIcon } from '@neko/ui/icons';
import type { AgentComposerWorkspacePresentation } from '../../ComposerWorkspaceContext';
import { useTranslation } from '../../../i18n/I18nContext';
import { ChevronDownIcon } from './DropdownMenu';
import { useComposerControlMenu } from './composer-menu-runtime';
import { useClickOutsideSingle } from './useClickOutside';
import {
  dropdownPositionClass,
  useDropdownPlacement,
  type DropdownPlacement,
} from './useDropdownDirection';

export function ComposerProjectSelector({
  disabled = false,
  presentation,
}: {
  readonly disabled?: boolean;
  readonly presentation: AgentComposerWorkspacePresentation;
}): JSX.Element {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useComposerControlMenu('project');
  const [placement, setPlacement] = useState<DropdownPlacement>({
    direction: 'up',
    alignment: 'start',
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const getPlacement = useDropdownPlacement(menuRef, {
    preferredDirection: 'up',
    estimatedWidth: 280,
  });

  useClickOutsideSingle(menuRef, () => setIsOpen(false));

  if (presentation.kind === 'workspace') {
    return (
      <div
        className="agent-control-chip agent-composer-project-current"
        aria-label={t('chat.input.project.current', { project: presentation.label })}
        title={presentation.label}
      >
        <FolderIcon size={13} />
        <span className="agent-control-chip-text">{presentation.label}</span>
      </div>
    );
  }

  const selectorDisabled = disabled || presentation.disabled === true;
  return (
    <div className="agent-composer-project relative" ref={menuRef}>
      <button
        type="button"
        className="agent-control-chip agent-composer-project-trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={selectorDisabled}
        title={t('chat.input.project.open')}
        onClick={() => {
          if (selectorDisabled) return;
          if (!isOpen) setPlacement(getPlacement());
          setIsOpen(!isOpen);
        }}
      >
        <FolderIcon size={13} />
        <span className="agent-control-chip-text">{t('chat.input.project.open')}</span>
        <ChevronDownIcon className="h-2.5 w-2.5 opacity-60" />
      </button>

      {isOpen && !selectorDisabled ? (
        <div
          className={`agent-composer-popover agent-composer-project-menu absolute ${dropdownPositionClass(placement)}`}
          role="menu"
          aria-label={t('chat.input.project.open')}
        >
          <div className="agent-composer-project-list">
            {presentation.projects.length > 0 ? (
              <>
                <div className="agent-composer-popover-section" role="presentation">
                  {t('chat.input.project.added')}
                </div>
                {presentation.projects.map((project) => (
                  <button
                    key={project.projectId}
                    type="button"
                    className="agent-composer-popover-row agent-composer-project-row"
                    role="menuitem"
                    disabled={project.disabled}
                    title={project.diagnostic ?? project.label}
                    onClick={() => {
                      if (project.disabled) return;
                      setIsOpen(false);
                      presentation.onSelectProject(project.projectId);
                    }}
                  >
                    <span className="agent-composer-glyph" aria-hidden="true">
                      <FolderIcon size={12} />
                    </span>
                    <span className="agent-composer-project-copy">
                      <span className="agent-composer-popover-primary">{project.label}</span>
                      {project.diagnostic ? (
                        <span className="agent-composer-popover-secondary">
                          {project.diagnostic}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </>
            ) : (
              <div className="agent-composer-popover-empty">{t('chat.input.project.empty')}</div>
            )}
          </div>
          <div className="agent-composer-project-directory">
            <button
              type="button"
              className="agent-composer-popover-row agent-composer-project-row"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                presentation.onChooseDirectory();
              }}
            >
              <span className="agent-composer-glyph" aria-hidden="true">
                <FolderIcon size={12} />
              </span>
              <span className="agent-composer-popover-primary">
                {t('chat.input.project.systemDirectory')}
              </span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
