import { createContext, useContext, useRef, useEffect, useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { MdClose } from 'react-icons/md';

interface DialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  _titleIdRef: React.MutableRefObject<string | undefined>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const ctx = useContext(DialogContext);
  if (!ctx) return { open: false, onOpenChange: () => {}, _titleIdRef: { current: undefined } };
  return ctx;
}

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

export function Dialog({ open: controlledOpen = false, onOpenChange, children }: DialogProps) {
  const titleIdRef = useRef<string | undefined>(undefined);
  return (
    <DialogContext.Provider
      value={{
        open: controlledOpen,
        onOpenChange: onOpenChange || (() => {}),
        _titleIdRef: titleIdRef,
      }}
    >
      {children}
    </DialogContext.Provider>
  );
}

interface DialogContentProps {
  className?: string;
  children?: ReactNode;
  onClose?: () => void;
  open?: boolean;
}

export function DialogContent({
  className,
  children,
  onClose,
  open: openProp,
}: DialogContentProps) {
  const { t } = useTranslation();
  const ctx = useDialogContext();
  const isOpen = openProp !== undefined ? openProp : ctx.open;

  const handleClose = () => {
    onClose?.();
    ctx.onOpenChange(false);
  };

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const prevFocus = document.activeElement as HTMLElement | null;

    const timer = requestAnimationFrame(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    });

    return () => {
      cancelAnimationFrame(timer);
      prevFocus?.focus();
    };
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
      return;
    }
    if (e.key === 'Tab') {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onKeyDown={handleKeyDown}>
      <div className="absolute inset-0 bg-zinc-900/50" onClick={handleClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        className={cn(
          'relative bg-surface dark:bg-zinc-900 rounded-lg max-w-lg w-full mx-4 max-h-[85vh] flex flex-col',
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ctx._titleIdRef.current}
      >
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 p-1 text-neutral hover:text-text-primary hover:bg-bg rounded-sm transition-colors"
          aria-label={t('common.close')}
        >
          <MdClose className="h-4 w-4" />
        </button>
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}

export function DialogHeader({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return <div className={cn('px-4 py-3 border-b border-border', className)}>{children}</div>;
}

export function DialogTitle({ className, children }: { className?: string; children?: ReactNode }) {
  const id = useId();
  const ctx = useContext(DialogContext);
  // Store title id via stable ref so DialogContent can read it synchronously
  if (ctx) ctx._titleIdRef.current = id;
  return (
    <h2
      id={id}
      className={cn(
        'font-display font-bold text-[20px] tracking-tight text-text-primary',
        className
      )}
    >
      {children}
    </h2>
  );
}

export function DialogFooter({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn('px-4 py-3 border-t border-border flex justify-end gap-2', className)}>
      {children}
    </div>
  );
}
