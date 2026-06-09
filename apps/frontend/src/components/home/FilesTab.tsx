import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatDate, formatDateShort, compareTimestamps } from '../../lib/dateFormat';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '../../hooks/useApi';
import { apiFetch } from '../../lib/apiClient';
import {
  MdDescription,
  MdNoteAdd,
  MdFilterList,
  MdSwapVert,
  MdDelete,
  MdEditDocument,
  MdShare,
  MdPerson,
  MdExitToApp,
  MdSearch,
  MdClose,
} from 'react-icons/md';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SkeletonDocumentCard } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { PermissionPanel } from '../PermissionPanel';
import type { Document } from '@collab/shared';

type FilterMode = 'all' | 'owned' | 'shared';
type SortMode = 'edited' | 'created' | 'name';

interface FilesTabProps {
  onFileSelect?: (documentId: string) => void;
  activeFileId?: string;
}

export function FilesTab({ onFileSelect, activeFileId }: FilesTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [sortMode, setSortMode] = useState<SortMode>('edited');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Document | null>(null);
  const [shareTarget, setShareTarget] = useState<Document | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});

  const { data: documents = [], isLoading: docsLoading } = useQuery<Document[]>({
    queryKey: ['documents'],
    queryFn: async () => {
      const res = await apiFetch('/api/documents');
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to fetch documents');
      return json.data?.items ?? json.data;
    },
  });

  const createDocumentMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiFetch('/api/documents', {
        method: 'POST',
        body: JSON.stringify({ title: name }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to create document');
      return json.data?.items ?? json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const res = await apiFetch(`/api/documents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to rename document');
      return json.data?.items ?? json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/documents/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to delete document');
      return json.data?.items ?? json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  // Fetch owner names for shared documents
  useEffect(() => {
    const sharedDocs = documents.filter((d) => d.ownerId !== user?.id);
    const uniqueOwnerIds = [...new Set(sharedDocs.map((d) => d.ownerId))];
    const missing = uniqueOwnerIds.filter((id) => !ownerNames[id]);
    if (missing.length === 0) return;

    let cancelled = false;
    Promise.all(
      missing.map(async (ownerId) => {
        try {
          const res = await apiFetch(`/api/users/${ownerId}`);
          const json = await res.json();
          if (json.success && json.data?.username) {
            return { id: ownerId, username: json.data.username };
          }
        } catch {
          /* ignore */
        }
        return { id: ownerId, username: ownerId.slice(0, 8) };
      })
    ).then((results) => {
      if (cancelled) return;
      setOwnerNames((prev) => {
        const next = { ...prev };
        for (const r of results) {
          next[r.id] = r.username;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  // oxlint-disable-next-line react-hooks/exhaustive-deps — ownerNames updated inside effect
  }, [documents, user?.id]);

  const filtered = useMemo(() => {
    let result = documents;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((d) => d.title.toLowerCase().includes(q));
    }
    if (filterMode === 'owned') result = result.filter((d) => d.ownerId === user?.id);
    if (filterMode === 'shared') result = result.filter((d) => d.ownerId !== user?.id);
    return result;
  }, [documents, filterMode, searchQuery, user?.id]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sortMode) {
      case 'created':
        arr.sort((a, b) => compareTimestamps(b.createdAt, a.createdAt));
        break;
      case 'name':
        arr.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'edited':
      default:
        arr.sort((a, b) => compareTimestamps(b.updatedAt, a.updatedAt));
        break;
    }
    return arr;
  }, [filtered, sortMode]);

  const handleFileSelect = (docId: string) => {
    if (onFileSelect) onFileSelect(docId);
    else navigate(`/editor/${docId}`);
  };

  const handleDelete = (e: React.MouseEvent, doc: Document) => {
    e.stopPropagation();
    setDeleteTarget(doc);
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const handleShare = (e: React.MouseEvent, doc: Document) => {
    e.stopPropagation();
    setShareTarget(doc);
  };

  const leaveDocumentMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const res = await apiFetch(`/api/permissions/${documentId}/leave`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to leave document');
      return json.data?.items ?? json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  const handleLeave = (e: React.MouseEvent, docId: string) => {
    e.stopPropagation();
    leaveDocumentMutation.mutate(docId);
  };

  const startInlineRename = (doc: Document) => {
    setEditingId(doc.id);
    setEditName(doc.title);
    setRenameTarget(doc);
  };

  const submitInlineRename = () => {
    const originalTitle = renameTarget?.title || '';
    if (editingId && editName.trim() && editName.trim() !== originalTitle) {
      renameMutation.mutate({ id: editingId, title: editName.trim() });
    }
    setEditingId(null);
    setEditName('');
    setRenameTarget(null);
  };

  const filters: { key: FilterMode; label: string }[] = [
    { key: 'all', label: t('home.filterAll') },
    { key: 'owned', label: t('home.filterOwned') },
    { key: 'shared', label: t('home.filterShared') },
  ];

  const sorts: { key: SortMode; label: string }[] = [
    { key: 'edited', label: t('home.sortEdited') },
    { key: 'created', label: t('home.sortCreated') },
    { key: 'name', label: t('home.sortName') },
  ];

  return (
    <div className="bg-bg dark:bg-zinc-900 shadow flex flex-col min-h-[calc(100vh-90px)]">
      {/* Toolbar */}
      <div className="p-4 border-b border-border dark:border-zinc-800 flex items-center justify-between gap-4 flex-wrap">
        {/* Left: actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setNewFileOpen(true)}
            className="p-2 rounded hover:bg-primary-50 dark:hover:bg-zinc-800 text-primary-600"
            title={t('home.newDocument')}
            aria-label={t('home.newDocument')}
          >
            <MdNoteAdd className="h-4 w-4" />
          </button>
        </div>

        {/* Right: search, filter, sort */}
        <div className="flex items-center gap-1">
          {/* Search */}
          {showSearch ? (
            <div className="relative w-[200px]">
              <MdSearch className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral dark:text-zinc-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label={t('home.searchFiles')}
                placeholder={t('home.searchFiles')}
                autoFocus
                className="w-full h-8 pl-7 pr-6 text-xs bg-transparent border border-border dark:border-zinc-700 rounded-sm text-text-primary dark:text-zinc-200 placeholder:text-neutral dark:placeholder:text-zinc-600 focus:outline-none focus:border-primary dark:focus:border-primary-400"
              />
              <button
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery('');
                }}
                aria-label={t('common.clearSearch')}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-neutral dark:text-zinc-400 hover:text-text-primary dark:hover:text-zinc-300"
              >
                <MdClose className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSearch(true)}
              className="p-1.5 rounded hover:bg-primary-50 dark:hover:bg-zinc-800 text-primary-600 dark:text-zinc-300"
              title={t('home.searchFiles')}
              aria-label={t('home.searchFiles')}
            >
              <MdSearch className="h-4 w-4" />
            </button>
          )}

          {/* Filter */}
          <div className="relative">
            <button
              onClick={() => {
                setShowFilterMenu(!showFilterMenu);
                setShowSortMenu(false);
              }}
              className="p-1.5 rounded hover:bg-primary-50 dark:hover:bg-zinc-800 text-primary-600 dark:text-zinc-300"
              title={filters.find((f) => f.key === filterMode)?.label}
              aria-label={filters.find((f) => f.key === filterMode)?.label || t('home.filterAll')}
            >
              <MdFilterList className="h-4 w-4" />
            </button>
            {showFilterMenu && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setShowFilterMenu(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-full mt-1 bg-bg dark:bg-zinc-900 border border-border dark:border-zinc-800 z-30 py-1 min-w-[120px]" role="menu">
                  {filters.map((f) => (
                    <button
                      key={f.key}
                      role="menuitem"
                      onClick={() => {
                        setFilterMode(f.key);
                        setShowFilterMenu(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-primary-50 dark:hover:bg-zinc-800 ${
                        filterMode === f.key
                          ? 'text-primary-600 dark:text-zinc-400 font-medium'
                          : 'text-primary-700 dark:text-zinc-300'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Sort */}
          <div className="relative">
            <button
              onClick={() => {
                setShowSortMenu(!showSortMenu);
                setShowFilterMenu(false);
              }}
              className="p-1.5 rounded hover:bg-primary-50 dark:hover:bg-zinc-800 text-primary-600 dark:text-zinc-300"
              title={sorts.find((s) => s.key === sortMode)?.label}
              aria-label={t('home.sortEdited')}
            >
              <MdSwapVert className="h-4 w-4" />
            </button>
            {showSortMenu && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setShowSortMenu(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-full mt-1 bg-bg dark:bg-zinc-900 border border-border dark:border-zinc-800 z-30 py-1 min-w-[120px]" role="menu">
                  {sorts.map((s) => (
                    <button
                      key={s.key}
                      role="menuitem"
                      onClick={() => {
                        setSortMode(s.key);
                        setShowSortMenu(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-primary-50 dark:hover:bg-zinc-800 ${
                        sortMode === s.key
                          ? 'text-primary-600 dark:text-zinc-400 font-medium'
                          : 'text-primary-700 dark:text-zinc-300'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {docsLoading ? (
        <div className="flex-1 px-4 pt-2 pb-4 overflow-auto">
          <div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
            aria-hidden="true"
          >
            {Array.from({ length: 6 }, (_, i) => (
              <SkeletonDocumentCard key={i} />
            ))}
          </div>
        </div>
      ) : documents.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <MdDescription className="h-12 w-12 mx-auto mb-3 text-primary-300 dark:text-primary-600" />
            <p className="text-sm text-text-secondary dark:text-zinc-400">
              {t('home.noOwnedFiles')}
            </p>
            <p className="text-xs text-neutral dark:text-zinc-500 mt-1">{t('home.createHint')}</p>
          </div>
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <MdDescription className="h-12 w-12 mx-auto mb-3 text-primary-300 dark:text-primary-600" />
            <p className="text-sm text-text-secondary dark:text-zinc-400">
              {t('home.noFilesFound')}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 px-4 pt-2 pb-4 overflow-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {sorted.map((doc) => {
              const isOwner = doc.ownerId === user?.id;
              const isEditing = editingId === doc.id;
              const neverEdited = compareTimestamps(doc.createdAt, doc.updatedAt) === 0;
              return (
                <div
                  key={doc.id}
                  className={`group border overflow-hidden transition-all active:scale-[0.98] ${
                    activeFileId === doc.id
                      ? 'border-primary-300 dark:border-zinc-700 bg-primary-50 dark:bg-zinc-950/20'
                      : 'border-border dark:border-zinc-800 hover:border-border dark:hover:border-primary-700 bg-bg dark:bg-zinc-900'
                  }`}
                >
                  {/* Preview */}
                  <div className="h-28 bg-bg dark:bg-zinc-950/50 flex items-center justify-center overflow-hidden">
                    <ContentPreview content={doc.content} />
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    {/* Row 1: filename full width */}
                    {isEditing ? (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        aria-label={t('home.renameDocument')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitInlineRename();
                          if (e.key === 'Escape') {
                            setEditingId(null);
                            setRenameTarget(null);
                          }
                        }}
                        onBlur={submitInlineRename}
                        autoFocus
                        className="w-full h-6 px-1 text-sm border border-primary-400 rounded outline-none focus:ring-1 focus:ring-primary-400"
                      />
                    ) : (
                      <p
                        className={`text-sm font-medium text-text-primary dark:text-zinc-100 truncate ${isOwner ? 'cursor-pointer hover:text-primary-600 dark:hover:text-neutral' : ''}`}
                        title={isOwner ? t('home.renameDocument') : doc.title}
                        onDoubleClick={() => {
                          if (isOwner) startInlineRename(doc);
                        }}
                      >
                        {doc.title}
                      </p>
                    )}

                    {/* Row 2: meta left, actions right */}
                    <div className="flex items-center justify-between gap-1 mt-1.5">
                      {/* Left: time (owned) or shared info */}
                      <div className="flex items-center gap-1 min-w-0">
                        {isOwner ? (
                          <span
                            className="text-[12px] text-neutral dark:text-zinc-400 cursor-default truncate"
                            title={
                              neverEdited
                                ? t('home.fileCreated', { time: formatDate(doc.createdAt) })
                                : t('home.fileEdited', { time: formatDate(doc.updatedAt) })
                            }
                          >
                            {neverEdited
                              ? t('home.fileCreated', { time: formatDateShort(doc.createdAt) })
                              : t('home.fileEdited', { time: formatDateShort(doc.updatedAt) })}
                          </span>
                        ) : (
                          <>
                            <span
                              className="flex-shrink-0"
                              title={t('home.sharedBy', {
                                name: ownerNames[doc.ownerId] || doc.ownerId.slice(0, 8),
                              })}
                            >
                              <MdPerson className="h-3.5 w-3.5 text-success dark:text-success-400" />
                            </span>
                            <span
                              className={`text-[12px] flex-shrink-0 ${
                                doc.permissionLevel === 'read-write'
                                  ? 'text-success dark:text-success-400'
                                  : 'text-neutral dark:text-zinc-400'
                              }`}
                            >
                              {doc.permissionLevel === 'read-write'
                                ? t('home.readWrite')
                                : t('home.readOnly')}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Right: actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => handleFileSelect(doc.id)}
                          className="p-1.5 rounded hover:bg-primary-50 dark:hover:bg-zinc-800 text-text-secondary dark:text-zinc-400 hover:text-primary-600 dark:hover:text-neutral"
                          title={t('editor.edit')}
                          aria-label={t('editor.edit')}
                        >
                          <MdEditDocument className="h-3.5 w-3.5" />
                        </button>
                        {isOwner ? (
                          <>
                            <button
                              onClick={(e) => handleShare(e, doc)}
                              className="p-1 rounded hover:bg-primary-50 dark:hover:bg-zinc-800 text-text-secondary dark:text-zinc-400 hover:text-success dark:hover:text-success-400"
                              title={t('home.sharedBadge')}
                              aria-label={t('home.sharedBadge')}
                            >
                              <MdShare className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDelete(e, doc)}
                              className="p-1 rounded hover:bg-primary-50 dark:hover:bg-zinc-800 text-text-secondary dark:text-zinc-400 hover:text-error dark:hover:text-error-400"
                              title={t('common.delete')}
                              aria-label={t('common.delete')}
                            >
                              <MdDelete className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={(e) => handleLeave(e, doc.id)}
                            className="p-1 rounded hover:bg-primary-50 dark:hover:bg-zinc-800 text-text-secondary dark:text-zinc-400 hover:text-error dark:hover:text-error-400"
                            title={t('home.leaveDocument')}
                            aria-label={t('home.leaveDocument')}
                          >
                            <MdExitToApp className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('common.delete')}</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <p className="text-sm text-text-secondary dark:text-zinc-400">
              {t('home.deleteConfirm', { title: deleteTarget?.title || '' })}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog
        open={shareTarget !== null}
        onOpenChange={(open) => {
          if (!open) setShareTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('home.sharedBadge')} — {shareTarget?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4">
            {shareTarget && (
              <PermissionPanel
                documentId={shareTarget.id}
                documentTitle={shareTarget.title}
                isOwner={shareTarget.ownerId === user?.id}
                onClose={() => setShareTarget(null)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* New File Dialog */}
      <Dialog open={newFileOpen} onOpenChange={setNewFileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('home.newDocument')}</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <NewItemForm
              placeholder={t('home.newDocument')}
              onConfirm={(name) => {
                createDocumentMutation.mutate(name);
                setNewFileOpen(false);
              }}
              onCancel={() => setNewFileOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function extractPreviewText(content: unknown, maxLen = 120): string | null {
  if (!content) return null;
  try {
    let text = '';
    if (typeof content === 'string') {
      text = content;
    } else if (typeof content === 'object' && content !== null) {
      // Yjs delta format or plain object — extract text nodes
      const obj = content as Record<string, unknown>;
      if (Array.isArray(obj.ops)) {
        text = obj.ops
          .filter((op: Record<string, unknown>) => typeof op.insert === 'string')
          .map((op: Record<string, unknown>) => op.insert as string)
          .join('');
      } else if (typeof obj.text === 'string') {
        text = obj.text;
      } else {
        text = JSON.stringify(content);
      }
    }
    const cleaned = text
      .replace(/[#*_~`>\-\n\r]+/g, '')
      .replace(/\s+/g, '')
      .trim();
    return cleaned.length > 0 ? cleaned.slice(0, maxLen) : null;
  } catch {
    return null;
  }
}

function ContentPreview({ content }: { content?: unknown }) {
  const previewText = extractPreviewText(content);

  if (previewText) {
    return (
      <div className="w-full h-full p-3">
        <p className="text-xs text-neutral dark:text-text-secondary leading-relaxed line-clamp-4">
          {previewText}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-1.5">
      <MdDescription className="h-10 w-10 text-neutral dark:text-primary" />
      <div className="space-y-1">
        <div className="h-0.5 w-12 bg-primary-50 dark:bg-primary-600 rounded" />
        <div className="h-0.5 w-16 bg-primary-50 dark:bg-primary-600 rounded" />
        <div className="h-0.5 w-10 bg-primary-50 dark:bg-primary-600 rounded" />
      </div>
    </div>
  );
}

function NewItemForm({
  placeholder,
  defaultValue = '',
  excludeId,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  placeholder: string;
  defaultValue?: string;
  excludeId?: string;
  confirmLabel?: string;
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
        // Network error — allow create to proceed
      } finally {
        setChecking(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [name, defaultValue, excludeId]);

  const handleConfirm = () => {
    if (name.trim() && !duplicate) {
      onConfirm(name.trim());
      setName('');
    }
  };

  const isValid = name.trim().length > 0 && !duplicate && !checking;

  return (
    <div className="space-y-4">
      <div>
        <Input
          placeholder={placeholder}
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
          <p className="mt-1.5 text-xs text-neutral dark:text-text-secondary">
            {t('common.loading')}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button onClick={handleConfirm} disabled={!isValid}>
          {confirmLabel || t('common.confirm')}
        </Button>
      </DialogFooter>
    </div>
  );
}
