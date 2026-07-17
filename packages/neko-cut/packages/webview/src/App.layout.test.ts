import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Cut creative workbench layout boundary', () => {
  const appSource = readFileSync(resolve(__dirname, 'App.tsx'), 'utf8');
  const hostAdapterSource = readFileSync(resolve(__dirname, 'host-adapter/index.tsx'), 'utf8');
  const timelineSource = readFileSync(
    resolve(__dirname, 'components/Timeline/Timeline.tsx'),
    'utf8',
  );
  const timelineControlsSource = readFileSync(
    resolve(__dirname, 'components/Timeline/TimelineControls.tsx'),
    'utf8',
  );

  it('uses the shared shell for the preview timeline and right properties without a left rail', () => {
    expect(appSource).toMatch(/import \{ CreativeWorkbenchShell \} from '@neko\/ui\/workbench'/);
    expect(appSource).toMatch(/<CreativeWorkbenchShell/);
    expect(appSource).toMatch(/mainKind="preview-timeline"/);
    expect(appSource).not.toMatch(/leftRail=/);
    expect(appSource).not.toMatch(/CutSideToolbar/);
    expect(appSource).toMatch(/mainClassName="cut-main-panel"/);
    expect(appSource).toMatch(/rightDock=\{\s*propertyPanelVisible\s*\?/);
    expect(appSource).toMatch(/id: 'cut-property-panel'/);
    expect(appSource).toMatch(/contentClassName:\s*'cut-property-panel-content/);
  });

  it('exposes basic and professional right-dock tabs through the shared shell', () => {
    expect(appSource).toMatch(/type CutRightDockMode = 'basic' \| 'professional'/);
    expect(appSource).toMatch(
      /const \[rightDockMode, setRightDockMode\] = useState<CutRightDockMode>\('basic'\)/,
    );
    expect(appSource).toMatch(/groups: \{/);
    expect(appSource).toMatch(/activeId: rightDockMode/);
    expect(appSource).toMatch(
      /onActiveIdChange: \(id\) => setRightDockMode\(toCutRightDockMode\(id\)\)/,
    );
    expect(appSource).toMatch(/label: t\('rightDock\.mode\.basic'\)/);
    expect(appSource).toMatch(/label: t\('rightDock\.mode\.professional'\)/);
  });

  it('keeps preview, timeline surfaces, and timeline controls inside the main panel', () => {
    expect(appSource).toMatch(/className="cut-preview-timeline-panel"/);
    expect(appSource).toMatch(/<PreviewControls/);
    expect(appSource).toMatch(/<Timeline/);
    expect(timelineSource).toMatch(/<TimelineControls/);
    expect(timelineSource).not.toMatch(/mainPanelToolsVisible/);
    expect(timelineControlsSource).toMatch(/<MainPanelControlLayer/);
    expect(timelineControlsSource).toMatch(/id="cut-main-panel-tools"/);
    expect(timelineControlsSource).toMatch(/visible=\{true\}/);
    expect(timelineControlsSource).toMatch(/placement="timeline-header"/);
  });

  it('keeps edit, package, property, and export actions in one timeline control bar', () => {
    expect(timelineControlsSource).toMatch(/timeline\.controls\.mediaTrack/);
    expect(timelineControlsSource).toMatch(/timeline\.controls\.split/);
    expect(timelineControlsSource).toMatch(/timeline\.controls\.snapping/);
    expect(timelineControlsSource).toMatch(/data-cut-control="package-project"/);
    expect(timelineControlsSource).toMatch(/data-cut-control="toggle-property-panel"/);
    expect(timelineControlsSource).toMatch(/aria-controls="cut-property-panel"/);
    expect(timelineControlsSource).toMatch(/timeline\.controls\.exportVideo/);
    expect(hostAdapterSource).not.toMatch(/CreativeLeftRail/);
    expect(hostAdapterSource).not.toMatch(/leftRail=/);
  });
});
