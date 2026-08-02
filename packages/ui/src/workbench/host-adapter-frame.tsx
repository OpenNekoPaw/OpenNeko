import type React from 'react';
import type { ReactNode } from 'react';
import { CreativeWorkbenchShell, type CreativeWorkbenchMainKind } from './creative-workbench';
import type { CreativeHostDocumentProjection, CreativeHostRuntimeProjection } from './host-adapter';

export interface CreativeHostAdapterFrameProps {
  readonly document: CreativeHostDocumentProjection;
  readonly runtime: CreativeHostRuntimeProjection;
  readonly mainKind: CreativeWorkbenchMainKind;
  readonly leftRail?: ReactNode;
  readonly main: ReactNode;
  readonly bottomPanel?: ReactNode;
  readonly className?: string;
  readonly inspectorLabels: CreativeHostAdapterInspectorLabels;
}

export interface CreativeHostAdapterInspectorLabels {
  readonly dock: string;
  readonly packageName: string;
  readonly panel: string;
  readonly runtime: string;
  readonly file: string;
}

export function CreativeHostAdapterFrame({
  bottomPanel,
  className,
  document,
  inspectorLabels,
  leftRail,
  main,
  mainKind,
  runtime,
}: CreativeHostAdapterFrameProps): React.ReactElement {
  const rightDock =
    runtime.hostAdapterInspector === 'hidden'
      ? undefined
      : {
          id: `host-adapter-dock-${runtime.panelKind}`,
          size: 260,
          minSize: 220,
          maxSize: 360,
          disabled: true,
          onSizeChange: () => undefined,
          label: inspectorLabels.dock,
          children: (
            <CreativeHostAdapterInspector
              document={document}
              labels={inspectorLabels}
              runtime={runtime}
            />
          ),
        };

  return (
    <CreativeWorkbenchShell
      className={className ?? 'neko-host-adapter-frame'}
      leftRail={leftRail}
      main={main}
      mainKind={mainKind}
      rightDock={rightDock}
      bottomPanel={bottomPanel}
    />
  );
}

function CreativeHostAdapterInspector({
  document,
  labels,
  runtime,
}: {
  readonly document: CreativeHostDocumentProjection;
  readonly labels: CreativeHostAdapterInspectorLabels;
  readonly runtime: CreativeHostRuntimeProjection;
}): React.ReactElement {
  return (
    <div className="neko-host-adapter-inspector" data-webview-package={runtime.packageName}>
      <h2>{runtime.label}</h2>
      <dl>
        <div>
          <dt>{labels.packageName}</dt>
          <dd>{runtime.packageName}</dd>
        </div>
        <div>
          <dt>{labels.panel}</dt>
          <dd>{runtime.panelKind}</dd>
        </div>
        <div>
          <dt>{labels.runtime}</dt>
          <dd>{runtime.runtime}</dd>
        </div>
        <div>
          <dt>{labels.file}</dt>
          <dd>{document.relativePath}</dd>
        </div>
      </dl>
    </div>
  );
}
