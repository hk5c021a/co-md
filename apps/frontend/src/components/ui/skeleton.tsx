// ── Skeleton — 通用骨架屏占位 ──
// 支持 variant: 'text' (单行) | 'card' (卡片) | 'circle' (圆形)
// 所有尺寸通过 className 传入，不做硬编码

import { clsx } from 'clsx';

interface SkeletonProps {
  children?: React.ReactNode;
  variant?: 'text' | 'card' | 'circle' | 'rect';
  className?: string;
  /** 骨架屏浅色/深色模式自定义 */
  bgClass?: string;
}

export function Skeleton({ variant = 'text', className, bgClass }: SkeletonProps) {
  const base = 'animate-pulse';
  const bg = bgClass || 'bg-bg dark:bg-zinc-800';

  return (
    <div
      className={clsx(
        base,
        bg,
        variant === 'text' && 'h-4 rounded w-full',
        variant === 'card' && 'rounded border border-border/30 dark:border-zinc-800',
        variant === 'circle' && 'rounded-full',
        // rect has no default shape — consumer provides full sizing via className
        className
      )}
      aria-hidden="true"
    />
  );
}

// ── 预组合的复杂骨架屏 ──

/** 文档卡片骨架（匹配 FilesTab 中的卡片结构） */
export function SkeletonDocumentCard() {
  return (
    <Skeleton variant="card" className="overflow-hidden">
      <Skeleton variant="rect" className="h-28 bg-bg dark:bg-zinc-950/50" />
      <div className="p-3 space-y-2">
        <Skeleton variant="text" className="w-3/4" />
        <div className="flex justify-between items-center">
          <Skeleton variant="text" className="w-1/3 h-2.5" />
          <div className="flex gap-1">
            <Skeleton variant="rect" className="h-5 w-5 rounded" />
            <Skeleton variant="rect" className="h-5 w-5 rounded" />
            <Skeleton variant="rect" className="h-5 w-5 rounded" />
          </div>
        </div>
      </div>
    </Skeleton>
  );
}

/** 联系人卡片骨架（匹配 ContactList 中的卡片结构） */
export function SkeletonContactCard() {
  return (
    <Skeleton variant="card" className="flex flex-col items-center p-4">
      <Skeleton variant="circle" className="w-12 h-12 mb-2" />
      <Skeleton variant="text" className="w-2/3 mb-1" />
      <Skeleton variant="text" className="w-1/2 h-3" />
    </Skeleton>
  );
}

/** 骨架屏网格容器 — 统一网格布局 */
export function SkeletonGrid({
  count = 6,
  columns = 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5',
  gap = 'gap-3',
  children,
}: {
  count?: number;
  columns?: string;
  gap?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`grid ${columns} ${gap}`} aria-hidden="true">
      {children
        ? children
        : Array.from({ length: count }, (_, i) => <SkeletonDocumentCard key={i} />)}
    </div>
  );
}
