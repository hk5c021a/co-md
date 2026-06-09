import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppErrorBoundary } from '../../src/components/AppErrorBoundary';

// Mock i18n for the wrapper component
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const fallbacks: Record<string, string> = {
        'error.somethingWentWrong': 'Something went wrong',
        'error.unexpectedError': 'An unexpected error occurred',
        'error.reloadPage': 'Reload page',
      };
      return fallbacks[key] || key;
    },
    i18n: { language: 'en' },
  }),
}));

// Component that throws
function Thrower({ msg }: { msg: string }) {
  throw new Error(msg);
}

describe('AppErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <AppErrorBoundary>
        <div>Hello World</div>
      </AppErrorBoundary>
    );
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('renders error UI on crash', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <AppErrorBoundary>
        <Thrower msg="Test crash" />
      </AppErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test crash')).toBeInTheDocument();
    expect(screen.getByText('Reload page')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('reload button is visible', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <AppErrorBoundary>
        <Thrower msg="Oops" />
      </AppErrorBoundary>
    );
    const btn = screen.getByRole('button', { name: /reload/i });
    expect(btn).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
