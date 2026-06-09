import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type ToastType = 'info' | 'success' | 'error' | 'warning';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  removing?: boolean;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toasts: [], addToast: () => {} });

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, removing: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 220);
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => removeToast(id), 4000);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto px-4 py-2.5 text-sm font-medium max-w-[calc(100vw-2rem)] sm:max-w-sm rounded-sm ${
              toast.removing ? 'animate-fade-out' : 'animate-slide-in-right'
            } ${
              toast.type === 'error'
                ? 'bg-error text-white'
                : toast.type === 'success'
                  ? 'bg-success text-white'
                  : toast.type === 'warning'
                    ? 'bg-warning text-white'
                    : 'bg-text-primary text-white dark:bg-zinc-700 dark:text-zinc-100'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
