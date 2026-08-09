export interface DesktopRendererApplicationModule {
  readonly mountDesktopRenderer: (container: HTMLElement) => Promise<void>;
}

export interface DesktopRendererBootstrapOptions {
  readonly document: Document;
  readonly loadApplication: () => Promise<DesktopRendererApplicationModule>;
  readonly reload: () => void;
}

const bootstrapCopy = {
  en: {
    title: 'OpenNeko could not start',
    description: 'The Desktop interface failed before it could finish loading.',
    retry: 'Reload',
  },
  zh: {
    title: 'OpenNeko 无法启动',
    description: '桌面界面在完成载入前发生错误。',
    retry: '重新载入',
  },
} as const;

export async function startDesktopRendererBootstrap(
  options: DesktopRendererBootstrapOptions,
): Promise<void> {
  const root = options.document.getElementById('root');
  if (!root) {
    throw new Error('OpenNeko Desktop renderer root is missing.');
  }

  try {
    const application = await options.loadApplication();
    if (typeof application.mountDesktopRenderer !== 'function') {
      throw new Error('OpenNeko Desktop application mount operation is missing.');
    }
    await application.mountDesktopRenderer(root);
  } catch (error) {
    renderBootstrapFailure(options.document, root, error, options.reload);
  }
}

function renderBootstrapFailure(
  target: Document,
  root: HTMLElement,
  error: unknown,
  reload: () => void,
): void {
  const copy = target.documentElement.lang.toLowerCase().startsWith('zh')
    ? bootstrapCopy.zh
    : bootstrapCopy.en;
  const alert = target.createElement('main');
  alert.className = 'desktop-bootstrap-error';
  alert.setAttribute('role', 'alert');
  alert.setAttribute('aria-live', 'assertive');

  const content = target.createElement('div');
  content.className = 'desktop-bootstrap-error__content';
  const title = target.createElement('h1');
  title.textContent = copy.title;
  const description = target.createElement('p');
  description.textContent = copy.description;
  const diagnostic = target.createElement('pre');
  diagnostic.className = 'desktop-bootstrap-error__diagnostic';
  diagnostic.textContent = error instanceof Error ? error.message : String(error);
  const retry = target.createElement('button');
  retry.className = 'desktop-bootstrap-error__retry';
  retry.type = 'button';
  retry.textContent = copy.retry;
  retry.addEventListener('click', reload, { once: true });

  content.append(title, description, diagnostic, retry);
  alert.append(content);
  root.replaceChildren(alert);
}
