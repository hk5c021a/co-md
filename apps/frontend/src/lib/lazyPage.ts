import { useState, useEffect, createElement, type ComponentType } from 'react';
import { Spinner } from '../components/ui/spinner';

/**
 * Manual lazy-load factory for route-level code splitting.
 *
 * Uses useState + useEffect instead of React.lazy() + Suspense to avoid
 * React error #306 (Invalid hook call) triggered by tokenStore Web Worker
 * messages arriving during a Suspense transition.
 *
 * Each call creates a module-level singleton that caches the loaded component
 * and the import promise, so only the first mount triggers a network fetch.
 */

type Importer<T> = () => Promise<{ default: T } | T>;

export function createLazyPage<T extends ComponentType<any>>(
  importer: Importer<T>,
  label: string
): ComponentType {
  let _Module: T | null = null;
  let _Promise: Promise<T> | null = null;

  function LazyPage() {
    const [Comp, setComp] = useState<T | null>(() => _Module);

    useEffect(() => {
      if (_Module) return;
      let cancelled = false;
      if (!_Promise) {
        _Promise = importer().then((m) => {
          const c = (m as any).default || m;
          _Module = c;
          return c;
        });
      }
      _Promise.then((mod) => {
        if (cancelled) return;
        setComp(() => mod);
      });
      return () => {
        cancelled = true;
      };
    }, []);

    if (!Comp) {
      return createElement(
        'div',
        { className: 'flex flex-col items-center justify-center min-h-dvh gap-4' },
        createElement(Spinner, { size: 'lg' }),
        createElement(
          'p',
          { className: 'text-sm text-text-secondary dark:text-zinc-400' },
          `Loading ${label}…`
        )
      );
    }
    return createElement(Comp);
  }

  LazyPage.displayName = `LazyPage(${label})`;
  return LazyPage;
}
