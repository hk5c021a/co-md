import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center font-medium rounded-sm transition-all',
          'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          {
            'bg-primary text-white hover:bg-primary-600 hover:-translate-y-px hover:shadow-btn-glow':
              variant === 'default',
            'border border-border bg-transparent text-primary hover:bg-primary-50':
              variant === 'outline',
            'text-primary hover:bg-primary-50': variant === 'ghost',
            'bg-error text-white hover:bg-red-600': variant === 'destructive',
          },
          {
            'min-h-[44px] px-6 text-[15px]': size === 'default',
            'min-h-[36px] px-4 text-[13px]': size === 'sm',
            'h-11 px-9 text-[17px]': size === 'lg',
            'h-[44px] w-[44px] p-0': size === 'icon',
          },
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { Button };
