import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { ILogger } from '@neko/shared';

export interface WebviewErrorBoundaryFallbackProps {
  readonly error: Error;
  readonly reset: () => void;
  readonly componentStack: string | null;
}

export type WebviewErrorBoundaryFallback =
  | ReactNode
  | ((props: WebviewErrorBoundaryFallbackProps) => ReactNode);

export interface WebviewErrorBoundaryProps {
  readonly children: ReactNode;
  readonly logger?: ILogger;
  readonly fallback?: WebviewErrorBoundaryFallback;
  readonly onError?: (error: Error, errorInfo: ErrorInfo) => void;
  readonly title?: ReactNode;
  readonly description?: ReactNode | ((error: Error) => ReactNode);
  readonly retryLabel?: ReactNode;
  readonly className?: string;
  readonly contentClassName?: string;
  readonly buttonClassName?: string;
}

export interface WebviewErrorBoundaryState {
  readonly error: Error | null;
  readonly componentStack: string | null;
}

export class WebviewErrorBoundary extends Component<
  WebviewErrorBoundaryProps,
  WebviewErrorBoundaryState
> {
  constructor(props: WebviewErrorBoundaryProps) {
    super(props);
    this.state = { error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): WebviewErrorBoundaryState {
    return { error, componentStack: null };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const componentStack = errorInfo.componentStack ?? null;
    this.setState({ componentStack });
    this.props.logger?.error('React render error captured by ErrorBoundary', {
      error,
      componentStack,
    });
    this.props.onError?.(error, errorInfo);
  }

  private readonly reset = (): void => {
    this.setState({ error: null, componentStack: null });
  };

  override render(): ReactNode {
    const { error, componentStack } = this.state;
    if (!error) {
      return this.props.children;
    }

    const fallbackProps: WebviewErrorBoundaryFallbackProps = {
      error,
      reset: this.reset,
      componentStack,
    };

    if (this.props.fallback) {
      return typeof this.props.fallback === 'function'
        ? this.props.fallback(fallbackProps)
        : this.props.fallback;
    }

    return <DefaultWebviewErrorFallback {...this.props} {...fallbackProps} />;
  }
}

export type CreateWebviewErrorBoundaryOptions = Omit<WebviewErrorBoundaryProps, 'children'>;

export function createWebviewErrorBoundary(defaults: CreateWebviewErrorBoundaryOptions) {
  return function BoundWebviewErrorBoundary(
    props: Omit<WebviewErrorBoundaryProps, keyof CreateWebviewErrorBoundaryOptions>,
  ): ReactNode {
    return <WebviewErrorBoundary {...defaults} {...props} />;
  };
}

function DefaultWebviewErrorFallback({
  error,
  reset,
  title = 'Something went wrong',
  description,
  retryLabel = 'Try again',
  className = 'flex h-full flex-col items-center justify-center p-4 text-center text-[var(--vscode-editor-foreground)]',
  contentClassName = 'flex max-w-md flex-col items-center gap-3',
  buttonClassName = 'rounded bg-[var(--vscode-button-background)] px-4 py-2 text-sm text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]',
}: WebviewErrorBoundaryFallbackProps & WebviewErrorBoundaryProps): ReactNode {
  const descriptionNode = typeof description === 'function' ? description(error) : description;
  return (
    <div role="alert" aria-live="assertive" className={className}>
      <div className={contentClassName}>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm opacity-75">{descriptionNode ?? error.message}</p>
        <button type="button" onClick={reset} className={buttonClassName}>
          {retryLabel}
        </button>
      </div>
    </div>
  );
}
