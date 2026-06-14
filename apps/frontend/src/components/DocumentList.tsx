import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Document } from '@co-md/shared';
import { apiFetch } from '../lib/apiClient';
import { SkeletonDocumentCard } from '../components/ui/skeleton';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { MdDescription, MdContentCopy, MdDelete, MdEdit, MdSearch, MdClose } from 'react-icons/md';

// -- DocumentListItem --

interface DocumentListItemProps {
  item: Document;
  onSelect: (item: Document) => void;
  onContextMenu: (e: React.MouseEvent, item: Document) => void;
  selectedId?: string;
  isEditing?: boolean;
}

function DocumentListItem({
  item,
  onSelect,
  onContextMenu,
  selectedId,
  isEditing,
}: DocumentListItemProps) {
  const { t } = useTranslation();
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(item);
    } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      onContextMenu(e as unknown as React.MouseEvent, item);
    }
  };

  return (
    <div
      className={`flex items-center gap-1 pl-2 py-1 cursor-pointer hover:bg-primary-50 dark:hover:bg-zinc-800 text-sm ${
        selectedId === item.id ? 'bg-surface dark:bg-zinc-800' : ''
      }`}
      onClick={() => onSelect(item)}
      onContextMenu={(e) => onContextMenu(e, item)}
      onKeyDown={handleKeyDown}
      role="option"
      aria-selected={selectedId === item.id}
      tabIndex={0}
    >
      <div className="w-5 flex-shrink-0" />
      <MdDescription className="h-4 w-4 text-primary flex-shrink-0" />
      <span className="truncate">{item.title}</span>
      {isEditing && (
        <span
          className="ml-auto flex-shrink-0 w-2 h-2 bg-success rounded-full"
          title={t('editor.editing')}
          aria-label={t('editor.editing')}
        />
      )}
    </div>
  );
}

// -- ContextMenu --

interface ContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onAction: (action: string) => void;
}

function ContextMenu({ open, x, y, onClose, onAction }: ContextMenuProps) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div
      className="fixed z-50 bg-bg dark:bg-zinc-900 border border-border dark:border-zinc-800 py-1 min-w-[140px] rounded-sm"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
      role="menu"
      onKeyDown={(e) => {
        if (e.key === 'Escape') { onClose(); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const items = e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]');
          const idx = Array.from(items).findIndex(el => el === document.activeElement);
          const next = e.key === 'ArrowDown'
            ? (idx + 1) % items.length
            : (idx - 1 + items.length) % items.length;
          items[next]?.focus();
        }
      }}
    >
      <button
        role="menuitem"
        className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-primary-50 dark:hover:bg-zinc-800 text-text-primary dark:text-zinc-300"
        onClick={() => onAction('rename')}
      >
        <MdEdit className="h-4 w-4" /> {t('home.rename')}
      </button>
      <button
        role="menuitem"
        className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-primary-50 dark:hover:bg-zinc-800 text-text-primary dark:text-zinc-300"
        onClick={() => onAction('copy')}
      >
        <MdContentCopy className="h-4 w-4" /> {t('home.copy')}
      </button>
      <button
        role="menuitem"
        className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-primary-50 dark:hover:bg-zinc-800 text-error dark:text-error-400"
        onClick={() => onAction('delete')}
      >
        <MdDelete className="h-4 w-4" /> {t('common.delete')}
      </button>
    </div>
  );
}

// -- Fuzzy search --

function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

// -- DocumentList (main) --

interface DocumentListProps {
  onFileSelect?: (documentId: string) => void;
  showEditingStatus?: boolean;
  activeFileId?: string;
}

export function DocumentList({
  onFileSelect,
  showEditingStatus = false,
  activeFileId,
}: DocumentListProps) {
  const [selectedId, setSelectedId] = useState<string>();
  const [contextMenu, setContextMenu] = useState<{ open: boolean; x: number; y: number }>({
    open: false,
    x: 0,
    y: 0,
  });
  const [contextMenuItem, setContextMenuItem] = useState<Document | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: documents = [], isLoading } = useQuery<Document[]>({
    queryKey: ['documents'],
    queryFn: async () => {
      const res = await apiFetch('/api/documents');
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to fetch documents');
      return json.data?.items ?? json.data;
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/documents/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to delete document');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  const renameDocumentMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const res = await apiFetch(`/api/documents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to rename document');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  const handleSelect = (item: Document) => {
    setSelectedId(item.id);
    if (onFileSelect) onFileSelect(item.id);
  };

  const handleContextMenu = (e: React.MouseEvent, item: Document) => {
    e.preventDefault();
    setContextMenu({ open: true, x: e.clientX, y: e.clientY });
    setContextMenuItem(item);
  };

  const handleContextAction = (action: string) => {
    if (!contextMenuItem) return;
    if (action === 'delete') {
      deleteDocumentMutation.mutate(contextMenuItem.id);
    }
    if (action === 'rename') {
      setRenameOpen(true);
    }
    setContextMenu({ open: false, x: 0, y: 0 });
  };

  const filteredDocuments = documents.filter((doc) => fuzzyMatch(doc.title, searchQuery));

  return (
    <div className="flex flex-col min-h-full">
      {/* Search bar */}
      <div className="px-2 pt-2 pb-1">
        <div className="relative">
          <MdSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral dark:text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={t('editor.searchFiles')}
            placeholder={t('editor.searchFiles')}
            className="w-full h-8 pl-8 pr-7 rounded-sm border border-border dark:border-zinc-700 bg-surface dark:bg-zinc-800 text-[13px] text-text-primary dark:text-zinc-200 placeholder:text-neutral dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-neutral dark:text-zinc-400 hover:text-text-primary dark:hover:text-zinc-200"
              aria-label={t('common.clearSearch')}
            >
              <MdClose className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col gap-1 p-2">
            {Array.from({ length: 5 }, (_, i) => (
              <SkeletonDocumentCard key={i} />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="flex items-center justify-center min-h-[120px] px-2 py-4 text-center text-xs text-neutral dark:text-zinc-400">
            {t('editor.noFiles')}
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="flex items-center justify-center min-h-[80px] px-2 py-4 text-center text-xs text-neutral dark:text-zinc-400">
            {t('editor.noFilesMatch', { query: searchQuery })}
          </div>
        ) : (
          <div role="listbox" aria-label={t('editor.documentList')}>
            {filteredDocuments.map((doc) => (
              <DocumentListItem
                key={doc.id}
                item={doc}
                onSelect={handleSelect}
                onContextMenu={handleContextMenu}
                selectedId={selectedId}
                isEditing={showEditingStatus && activeFileId === doc.id}
              />
            ))}
          </div>
        )}
      </div>

      <ContextMenu
        open={contextMenu.open}
        x={contextMenu.x}
        y={contextMenu.y}
        onClose={() => setContextMenu({ open: false, x: 0, y: 0 })}
        onAction={handleContextAction}
      />

      {/* Rename Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('home.renameDocument')}</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <RenameForm
              defaultValue={(contextMenuItem as Document)?.title || ''}
              excludeId={contextMenuItem?.id}
              onConfirm={(name) => {
                if (contextMenuItem) {
                  renameDocumentMutation.mutate({ id: contextMenuItem.id, title: name });
                }
                setRenameOpen(false);
                setContextMenuItem(null);
              }}
              onCancel={() => {
                setRenameOpen(false);
                setContextMenuItem(null);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RenameForm({
  defaultValue,
  excludeId,
  onConfirm,
  onCancel,
}: {
  defaultValue: string;
  excludeId?: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(defaultValue);
  const [duplicate, setDuplicate] = useState(false);
  const [checking, setChecking] = useState(false);

  // Debounced duplicate name check
  useEffect(() => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === defaultValue.trim()) {
      setDuplicate(false);
      setChecking(false);
      return;
    }

    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        let url = `/api/documents/check-name?title=${encodeURIComponent(trimmed)}`;
        if (excludeId) {
          url += `&excludeId=${encodeURIComponent(excludeId)}`;
        }
        const res = await apiFetch(url);
        const json = await res.json();
        setDuplicate(json.success && json.data?.exists === true);
      } catch {
        // Network error — allow rename to proceed
      } finally {
        setChecking(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [name, defaultValue, excludeId]);

  const handleConfirm = () => {
    if (name.trim() && !duplicate) onConfirm(name.trim());
  };

  const isValid = name.trim().length > 0 && !duplicate && !checking;

  return (
    <div className="space-y-4">
      <div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && isValid) handleConfirm();
          }}
          autoFocus
          className={duplicate ? 'ring-error border-error' : ''}
          aria-invalid={duplicate}
        />
        {duplicate && (
          <p className="mt-1.5 text-xs text-error dark:text-error-400">
            {t('home.documentNameDuplicate')}
          </p>
        )}
        {checking && (
          <p className="mt-1.5 text-xs text-neutral dark:text-zinc-400">{t('common.loading')}</p>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button onClick={handleConfirm} disabled={!isValid}>
          {t('home.renameDocument')}
        </Button>
      </DialogFooter>
    </div>
  );
}
