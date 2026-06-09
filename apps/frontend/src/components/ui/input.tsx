import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

const Input = forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-sm border border-border dark:border-zinc-700 bg-surface dark:bg-zinc-900 px-3 py-2',
        'text-sm placeholder:text-neutral',
        'focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-bg',
        'aria-invalid:border-error',
        className
      )}
      ref={ref}
      {...props}
    />
  );
});

Input.displayName = 'Input';

export { Input };
