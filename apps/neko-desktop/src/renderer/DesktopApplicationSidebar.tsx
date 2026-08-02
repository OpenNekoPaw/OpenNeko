import { useTranslation } from '@neko/ui/i18n/react';
import { ResizeHandle, useResizable, type ControlledWorkbenchResizeBinding } from '@neko/ui';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { APPLICATION_PRIMARY_SIDEBAR_DEFAULT_WIDTH } from '../shared/workbench-contract';

export function DesktopApplicationSidebarFrame({
  children,
  compact,
  expandedWidth,
  resize,
}: {
  readonly children: ReactNode;
  readonly compact: boolean;
  readonly expandedWidth: number;
  readonly resize?: ControlledWorkbenchResizeBinding;
}): JSX.Element {
  const width = compact ? 64 : expandedWidth;
  const [liveWidth, setLiveWidth] = useState(width);
  useEffect(() => {
    setLiveWidth(width);
  }, [width]);
  const resizeState = useResizable<HTMLDivElement>({
    edge: 'left',
    mode: 'pixel',
    size: liveWidth,
    minSize: resize?.minSize,
    maxSize: resize?.maxSize,
    disabled: compact || !resize,
    onSizeChange: setLiveWidth,
    onResizeEnd: resize?.onResizeEnd,
  });
  const frameStyle: CSSProperties & {
    '--application-primary-sidebar-expanded-width': string;
  } = {
    '--application-primary-sidebar-expanded-width': `${expandedWidth}px`,
    width: resizeState.size,
  };
  return (
    <div
      ref={(element) => {
        resizeState.containerRef.current = element;
      }}
      className="application-primary-sidebar-frame"
      data-primary-sidebar-frame="application"
      data-primary-sidebar-placement="flush"
      data-primary-sidebar-default-width={APPLICATION_PRIMARY_SIDEBAR_DEFAULT_WIDTH}
      data-primary-sidebar-expanded-width={expandedWidth}
      data-primary-sidebar-hover-reveal={compact ? 'true' : 'false'}
      data-primary-sidebar-width={resizeState.size}
      data-resizing={resizeState.isResizing ? 'true' : 'false'}
      style={frameStyle}
    >
      {children}
      {resize && !compact ? (
        <ResizeHandle
          className="neko-controlled-workbench-resize-handle neko-controlled-workbench-resize-handle--right"
          handleProps={resizeState.handleProps}
          label={resize.label}
        />
      ) : null}
    </div>
  );
}

export function DesktopApplicationBrand({
  control,
}: {
  readonly control?: ReactNode;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="home-brand">
      <span className="brand-mark" aria-hidden="true">
        N
      </span>
      <strong>{t('app.name')}</strong>
      {control}
    </div>
  );
}

export function DesktopApplicationNavigationButton({
  active,
  disabled = false,
  icon,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly disabled?: boolean;
  readonly icon: ReactNode;
  readonly label: string;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`home-nav-button ${active ? 'is-active' : ''}`}
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
