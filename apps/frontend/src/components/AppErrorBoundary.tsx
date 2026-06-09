import { Component, type ReactNode, type ErrorInfo } from 'react';
import { useTranslation } from 'react-i18next';

interface TFunc {
  (key: string): string;
}

interface Props {
  children: ReactNode;
  t?: TFunc;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundaryInner extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.PROD) {
      fetch('/api/csp-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'frontend-error',
          message: error.message,
          stack: error.stack,
          componentStack: info.componentStack,
        }),
      }).catch(() => {});
    }
  }

  render() {
    if (this.state.hasError) {
      const t = this.props.t || ((key: string) => key);
      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center min-h-dvh p-8 text-center
            bg-bg dark:bg-zinc-950 text-text dark:text-zinc-100"
        >
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/20">
            <svg
              className="h-8 w-8 text-red-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold mb-2">{t('error.somethingWentWrong')}</h1>
          <p className="text-text-secondary dark:text-zinc-400 mb-6 max-w-md">
            {this.state.error?.message || t('error.unexpectedError')}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="inline-flex items-center px-6 py-2.5 rounded-md bg-primary text-white
              font-medium text-sm hover:brightness-110 transition-all
              focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12"
          >
            {t('error.reloadPage')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Wrapper that provides i18n translation to the class-based error boundary
export function AppErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return <ErrorBoundaryInner t={t}>{children}</ErrorBoundaryInner>;
}
