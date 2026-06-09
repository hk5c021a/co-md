import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MdVisibility, MdVisibilityOff } from 'react-icons/md';
import { cn } from '../../lib/utils';

interface PasswordInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
}

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, disabled, icon, ...props }, ref) => {
    const { t } = useTranslation();
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          className={cn(className, icon ? 'pr-16' : 'pr-10')}
          ref={ref}
          disabled={disabled}
          {...props}
        />
        {icon && <span className="absolute right-8 top-1/2 -translate-y-1/2">{icon}</span>}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setVisible(!visible)}
          disabled={disabled}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral hover:text-text-primary disabled:opacity-50"
          aria-label={visible ? t('common.hidePassword') : t('common.showPassword')}
        >
          {visible ? <MdVisibilityOff className="h-4 w-4" /> : <MdVisibility className="h-4 w-4" />}
        </button>
      </div>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';

export { PasswordInput };
