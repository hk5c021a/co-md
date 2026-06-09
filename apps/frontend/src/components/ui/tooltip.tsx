import React, { useState, useRef, useCallback, useEffect, useId, type ReactNode } from 'react';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
  variant?: 'error' | 'info';
}

export function Tooltip({
  content,
  children,
  side = 'top',
  className,
  variant = 'error',
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const hasContent = content !== '' && content !== null && content !== undefined;
  const cachedContent = useRef<ReactNode>(undefined);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (hasContent) {
      cachedContent.current = content;
      setClosing(false);
      setOpen(true);
    } else if (open && !closing) {
      setClosing(true);
      timeoutRef.current = setTimeout(() => {
        setOpen(false);
        setClosing(false);
      }, 250);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  // oxlint-disable-next-line react-hooks/exhaustive-deps — content/open/closing cause loop
  }, [hasContent]);

  const show = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (hasContent) {
      setClosing(false);
      setOpen(true);
    }
  }, [hasContent]);

  const hide = useCallback(() => {
    if (!hasContent) {
      timeoutRef.current = setTimeout(() => setOpen(false), 150);
    }
  }, [hasContent]);

  const sideClasses: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  };

  const variantClasses: Record<string, string> = {
    error: 'bg-red-50 text-error border border-red-200 rounded-sm',
    info: 'bg-surface dark:bg-zinc-900 text-text-primary dark:text-zinc-100 border border-border dark:border-zinc-700 rounded-sm',
  };

  const arrowColors: Record<string, string> = {
    error: 'border-t-red-200',
    info: 'border-t-border',
  };

  const arrowClasses: Record<string, string> = {
    top: `top-full left-1/2 -translate-x-1/2 ${arrowColors[variant]} border-x-transparent border-b-transparent border-4`,
    bottom: `bottom-full left-1/2 -translate-x-1/2 ${arrowColors[variant].replace('t-', 'b-').replace('border-t', 'border-b')} border-x-transparent border-t-transparent border-4`,
  };

  const displayContent = closing ? cachedContent.current : content;

  // Forward aria-describedby to the input child so screen readers announce errors
  const child = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<{ 'aria-describedby'?: string; 'aria-invalid'?: string }>, {
        'aria-describedby': open ? tooltipId : undefined,
        'aria-invalid': open && variant === 'error' ? 'true' : undefined,
      })
    : children;

  return (
    <span
      className={`relative ${className || 'inline-flex'}`}
      onFocus={show}
      onBlur={hide}
    >
      {child}
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className={`absolute z-50 ${sideClasses[side]} px-2.5 py-1.5 ${variantClasses[variant]} text-xs leading-relaxed whitespace-nowrap pointer-events-none transition-opacity duration-200 ${closing ? 'opacity-0' : 'opacity-100'}`}
        >
          {displayContent}
          <span className={`absolute ${arrowClasses[side]}`} />
        </span>
      )}
    </span>
  );
}
