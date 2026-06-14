import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/apiClient';
import { MdSearch, MdClose } from 'react-icons/md';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface PermissionEntry {
  permissionId: string;
  documentId: string;
  documentTitle: string;
  level: string;
  isOwner: boolean;
}

interface ContactPermissionDialogProps {
  open: boolean;
  contactId: string;
  contactName: string;
  onClose: () => void;
}

export function ContactPermissionDialog({
  open,
  contactId,
  contactName,
  onClose,
}: ContactPermissionDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [changes, setChanges] = useState<Record<string, string | null>>({}); // permId → level | null (null = revoke)
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: allPermissions = [], isLoading } = useQuery<PermissionEntry[]>({
    queryKey: ['contact-permissions', contactId],
    queryFn: async () => {
      const res = await apiFetch(`/api/permissions/contact/${contactId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed');
      return json.data;
    },
    enabled: open && !!contactId,
  });

  // Only show documents owned by the current user — these are the ones the
  // current user shared with this contact. Documents shared by other owners
  // are excluded; managing those requires the respective owner.
  const permissions = useMemo(
    () => allPermissions.filter((p) => p.isOwner),
    [allPermissions]
  );

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return permissions;
    const q = searchQuery.trim().toLowerCase();
    return permissions.filter((p) => p.documentTitle.toLowerCase().includes(q));
  }, [permissions, searchQuery]);

  const handleLevelChange = (permId: string, level: string) => {
    setChanges((prev) => {
      const entry = permissions.find((p) => p.permissionId === permId);
      // If changed back to original, remove from changes
      if (entry && entry.level === level) {
        const { [permId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [permId]: level };
    });
  };

  const handleRevoke = (permId: string) => {
    setChanges((prev) => {
      // Toggle revoke: if already set to null, restore original
      if (prev[permId] === null) {
        const { [permId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [permId]: null };
    });
  };

  const handleConfirm = async () => {
    setSaving(true);
    let errors = 0;

    for (const [permId, newLevel] of Object.entries(changes)) {
      const entry = permissions.find((p) => p.permissionId === permId);
      if (!entry) continue;

      try {
        if (newLevel === null) {
          // Revoke
          const res = await apiFetch(`/api/permissions/${entry.documentId}/permissions/${permId}`, {
            method: 'DELETE',
          });
          if (!res.ok) errors++;
        } else {
          // Update level
          const res = await apiFetch(`/api/permissions/${entry.documentId}/permissions`, {
            method: 'POST',
            body: JSON.stringify({ permissions: [{ userId: contactId, level: newLevel }] }),
          });
          if (!res.ok) errors++;
        }
      } catch {
        errors++;
      }
    }

    if (errors === 0) {
      queryClient.invalidateQueries({ queryKey: ['contact-permissions', contactId] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setChanges({});
      onClose();
    } else {
      setError(
        t('home.errorUpdatingPermissions') || 'Failed to update permissions. Please try again.'
      );
    }
    setSaving(false);
  };

  const changedCount = Object.keys(changes).length;

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('home.managePermission')} — {contactName}
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 space-y-3">
          {/* Search */}
          <div className="relative">
            <MdSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral dark:text-zinc-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={t('home.searchFiles')}
              placeholder={t('home.searchFiles')}
              className="w-full h-8 pl-8 pr-8 text-sm bg-transparent border border-border dark:border-zinc-700 rounded-sm text-text-primary dark:text-zinc-200 placeholder:text-neutral dark:placeholder:text-zinc-600 focus:outline-none focus:border-primary dark:focus:border-primary-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-neutral dark:text-zinc-400 hover:text-text-primary dark:hover:text-zinc-300"
                aria-label={t('common.clearSearch')}
              >
                <MdClose className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* List */}
          {isLoading ? (
            <p className="text-sm text-neutral dark:text-zinc-400 text-center py-8">
              {t('common.loading')}
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-neutral dark:text-zinc-400 text-center py-8">
              {permissions.length === 0 ? t('home.noSharedDocuments') : t('home.noMatchingFiles')}
            </p>
          ) : (
            <div className="max-h-[360px] overflow-y-auto space-y-1">
              {filtered.map((entry) => {
                const currentLevel =
                  changes[entry.permissionId] !== undefined
                    ? changes[entry.permissionId]
                    : entry.level;
                const isRevoked = currentLevel === null;
                const isChanged = changes[entry.permissionId] !== undefined;

                return (
                  <div
                    key={entry.permissionId}
                    className={`flex items-center gap-2 px-3 py-2 rounded-sm border transition-colors ${
                      isChanged
                        ? 'border-primary-300 dark:border-primary-700 bg-primary-50/50 dark:bg-primary-900/10'
                        : 'border-transparent hover:bg-surface dark:hover:bg-zinc-800'
                    } ${isRevoked ? 'opacity-50' : ''}`}
                  >
                    {/* Document title */}
                    <span className="flex-1 text-sm text-text-primary dark:text-zinc-100 truncate min-w-0">
                      {entry.documentTitle}
                    </span>

                    {/* Permission dropdown (only for owned docs) */}
                    {entry.isOwner ? (
                      <select
                        value={isRevoked ? 'revoked' : (currentLevel as string)}
                        onChange={(e) => {
                          if (e.target.value === 'revoked') {
                            handleRevoke(entry.permissionId);
                          } else {
                            handleLevelChange(entry.permissionId, e.target.value);
                          }
                        }}
                        aria-label={t('home.permissionLevel')}
                        className="h-[30px] px-2 text-xs bg-transparent border border-border dark:border-zinc-700 rounded-sm text-text-primary dark:text-zinc-200 focus:outline-none focus:border-primary dark:focus:border-primary-400"
                      >
                        <option value="read-write">{t('home.readWrite')}</option>
                        <option value="read-only">{t('home.readOnly')}</option>
                        <option value="revoked">{t('common.delete')}</option>
                      </select>
                    ) : (
                      <span
                        className={`text-[12px] ${
                          entry.level === 'read-write'
                            ? 'text-success dark:text-success-400'
                            : 'text-neutral dark:text-zinc-400'
                        }`}
                      >
                        {entry.level === 'read-write' ? t('home.readWrite') : t('home.readOnly')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="text-error dark:text-red-400 text-[13px] px-4">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={changedCount === 0 || saving}>
            {saving
              ? t('common.loading')
              : changedCount > 0
                ? `${t('common.confirm')} (${changedCount})`
                : t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
