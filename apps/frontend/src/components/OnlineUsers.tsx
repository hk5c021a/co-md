import { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MdPeople } from 'react-icons/md';
import type { OnlineUser } from '../types/models';

interface OnlineUsersProps {
  users: OnlineUser[];
}

export function OnlineUsers({ users }: OnlineUsersProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const uniqueUsers = useMemo(() => {
    const seen = new Set<number>();
    return users.filter((u) => {
      if (seen.has(u.clientId)) return false;
      seen.add(u.clientId);
      return true;
    });
  }, [users]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', onMouseDown);
      document.addEventListener('keydown', onKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (uniqueUsers.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-surface dark:hover:bg-zinc-800 transition-colors text-neutral dark:text-zinc-400"
        title={t('editor.onlineUsers', { count: uniqueUsers.length })}
        aria-expanded={open}
        aria-label={t('editor.onlineUsers', { count: uniqueUsers.length })}
      >
        <MdPeople className="h-3.5 w-3.5" />
        <span className="text-[12px] font-medium">{uniqueUsers.length}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 bg-surface dark:bg-zinc-900 border border-border dark:border-zinc-700 rounded-lg shadow-lg z-50 py-1 animate-slide-down">
          <div className="px-3 py-1.5 text-[12px] text-neutral dark:text-zinc-400 font-medium border-b border-border dark:border-zinc-800">
            {t('editor.onlineUsers', { count: uniqueUsers.length })}
          </div>
          {uniqueUsers.map((user) => (
            <div
              key={user.clientId}
              className="flex items-center gap-2 px-3 py-2 hover:bg-bg dark:hover:bg-zinc-800 transition-colors"
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                style={{ backgroundColor: user.color }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-text-primary dark:text-zinc-100 truncate">
                {user.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
