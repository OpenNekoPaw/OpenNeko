import type { ReactNode } from 'react';

export function WorkbenchMainPanelSurface({
  active,
  children,
  mainGroupId,
  label,
  panelId,
  role = 'workspace',
  size = 'full',
  tabs,
}: {
  readonly active?: boolean;
  readonly children: ReactNode;
  readonly mainGroupId?: string;
  readonly label?: string;
  readonly panelId: string;
  readonly role?: 'workspace' | 'management' | 'detail';
  readonly size?: 'compact' | 'full';
  readonly tabs?: ReactNode;
}): JSX.Element {
  return (
    <section
      className="project-main-group desktop-workbench-main-panel"
      data-active={active === undefined ? undefined : active ? 'true' : 'false'}
      data-main-group={mainGroupId}
      data-panel-role={role}
      data-panel-size={size}
      data-workbench-main-panel={panelId}
      aria-label={label}
    >
      {tabs ? <header className="project-main-group__tabs">{tabs}</header> : null}
      <div className="project-main-group__content">{children}</div>
    </section>
  );
}
