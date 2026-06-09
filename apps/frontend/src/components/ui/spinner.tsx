// ── Spinner — 通用旋转加载指示器 ──
// 轻量级，用于按钮内、行内、表单提交中等场景

import { clsx } from 'clsx';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses: Record<string, string> = {
  sm: 'h-3.5 w-3.5 border-2',
  md: 'h-5 w-5 border-[3px]',
  lg: 'h-8 w-8 border-[3px]',
};

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div
      className={clsx(
        'animate-spin rounded-full border-primary/30 border-t-primary',
        sizeClasses[size],
        className
      )}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

// ── 全页居中加载 ──

export function PageSpinner() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-bg dark:bg-zinc-950">
      <Spinner size="lg" />
    </div>
  );
}
