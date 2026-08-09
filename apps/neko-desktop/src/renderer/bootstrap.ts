import { startDesktopRendererBootstrap } from './desktop-renderer-bootstrap';

void startDesktopRendererBootstrap({
  document,
  loadApplication: () => import('./main'),
  reload: () => window.location.reload(),
});
