import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useDocumentPermissions,
  useGrantPermissions,
  useRevokePermission,
  useContacts,
} from '../hooks/useApi';
import type { Contact, Permission } from '../hooks/useApi';
import { MdClose } from 'react-icons/md';
import { Button } from './ui/button';

interface PendingEntry {
  userId: string;
  username: string;
  email: string;
  level: 'read-only' | 'read-write';
}

interface PermissionPanelProps {
  documentId: string;
  documentTitle: string;
  isOwner: boolean;
  onClose: () => void;
}

export function PermissionPanel({
  documentId,
  documentTitle,
  isOwner,
  onClose,
}: PermissionPanelProps) {
  const { t } = useTranslation();
  const { data: permissions = [], isLoading } = useDocumentPermissions(documentId);
  const { data: contacts = [] } = useContacts();
  const grantPermission = useGrantPermissions();
  const revokePermission = useRevokePermission();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([]);

  // Existing permission user IDs for dedup
  const existingUserIds = useMemo(() => new Set(permissions.map((p) => p.userId)), [permissions]);
  const pendingUserIds = useMemo(
    () => new Set(pendingEntries.map((e) => e.userId)),
    [pendingEntries]
  );

  const searchResults = useMemo(() => {
    if (searchQuery.length < 2) return [];
    return contacts.filter(
      (c) =>
        (c.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.email.toLowerCase().includes(searchQuery.toLowerCase())) &&
        !existingUserIds.has(c.id) &&
        !pendingUserIds.has(c.id)
    );
  }, [contacts, searchQuery, existingUserIds, pendingUserIds]);

  const handleAddEntry = (contact: Contact) => {
    setPendingEntries((prev) => [
      ...prev,
      {
        userId: contact.id,
        username: contact.username,
        email: contact.email,
        level: 'read-only',
      },
    ]);
    setSearchQuery('');
    setSearchOpen(false);
  };

  const handleRemovePending = (userId: string) => {
    setPendingEntries((prev) => prev.filter((e) => e.userId !== userId));
  };

  const handlePendingLevelChange = (userId: string, level: 'read-only' | 'read-write') => {
    setPendingEntries((prev) => prev.map((e) => (e.userId === userId ? { ...e, level } : e)));
  };

  const handleRevokePermission = (permissionId: string) => {
    revokePermission.mutate({ documentId, permissionId });
  };

  const handleLevelChange = (permission: Permission, newLevel: 'read-only' | 'read-write') => {
    grantPermission.mutate({
      documentId,
      permissions: [{ userId: permission.userId, level: newLevel }],
    });
  };

  const handleSubmit = () => {
    if (pendingEntries.length === 0) return;
    grantPermission.mutate(
      {
        documentId,
        permissions: pendingEntries.map((e) => ({
          userId: e.userId,
          level: e.level,
        })),
      },
      {
        onSuccess: () => {
          setPendingEntries([]);
          onClose();
        },
      }
    );
  };

  const hasPending = pendingEntries.length > 0;

  if (!isOwner) {
    return (
      <div className="p-4 text-center text-sm text-text-secondary dark:text-zinc-400">
        {t('home.sharedBadge')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <input
          type="text"
          aria-label={t('home.searchUsers')}
          placeholder={t('home.searchUsers')}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => {
            if (searchQuery.length >= 2) setSearchOpen(true);
          }}
          className="w-full h-8 rounded-sm border border-border dark:border-zinc-700 bg-bg dark:bg-zinc-800 text-text-primary dark:text-zinc-100 px-3 py-1.5 text-sm placeholder:text-neutral dark:placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
        />
        {searchOpen && searchResults.length > 0 && (
          <div className="absolute z-10 w-full mt-1 border border-border dark:border-zinc-800 bg-bg dark:bg-zinc-900 max-h-40 overflow-y-auto">
            {searchResults.map((user) => (
              <button
                key={user.id}
                onClick={() => handleAddEntry(user)}
                className="w-full px-3 py-2 text-left hover:bg-surface dark:hover:bg-zinc-800 border-b border-primary-100 dark:border-zinc-800 last:border-b-0"
              >
                <div className="font-medium text-sm text-text-primary dark:text-zinc-100">
                  {user.username}
                </div>
                <div className="text-xs text-text-secondary dark:text-zinc-400">{user.email}</div>
              </button>
            ))}
          </div>
        )}
        {searchOpen && searchQuery.length >= 2 && searchResults.length === 0 && (
          <div className="absolute z-10 w-full mt-1 border border-border dark:border-zinc-800 bg-bg dark:bg-zinc-900 p-3 text-center text-sm text-text-secondary dark:text-zinc-400">
            {t('home.noContacts')}
          </div>
        )}
      </div>

      {/* Collaborators table */}
      <div>
        {isLoading ? (
          <div className="text-center py-4 text-sm text-neutral dark:text-zinc-400">
            {t('common.loading')}
          </div>
        ) : permissions.length === 0 && pendingEntries.length === 0 ? (
          <div className="text-center py-4 text-sm text-neutral dark:text-zinc-400">
            {t('home.noContacts')}
          </div>
        ) : (
          <div className="space-y-1">
            {/* Existing permissions */}
            {permissions.map((perm) => (
              <div key={perm.id} className="flex items-center gap-2 p-2 bg-bg dark:bg-zinc-800/50">
                <div className="flex items-center gap-1 min-w-0 group">
                  <span className="text-sm text-text-primary dark:text-zinc-100 truncate leading-none">
                    {perm.user?.username || t('common.unknownUser')}
                  </span>
                  <button
                    onClick={() => handleRevokePermission(perm.id)}
                    disabled={revokePermission.isPending}
                    className="p-1.5 text-neutral hover:text-error rounded hover:bg-primary-50 dark:hover:bg-primary-600 disabled:opacity-50 flex-shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                    title={t('common.delete')}
                  >
                    <MdClose className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex-1" />
                <select
                  value={perm.level}
                  onChange={(e) =>
                    handleLevelChange(perm, e.target.value as 'read-only' | 'read-write')
                  }
                  aria-label={t('home.permissionLevel')}
                  className="h-8 w-24 rounded border border-border dark:border-zinc-700 bg-bg dark:bg-zinc-800 text-text-primary dark:text-zinc-100 px-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="read-only">{t('home.readOnly')}</option>
                  <option value="read-write">{t('home.readWrite')}</option>
                </select>
              </div>
            ))}

            {/* Pending entries */}
            {pendingEntries.map((entry) => (
              <div
                key={entry.userId}
                className="flex items-center gap-2 p-2 bg-primary-50 dark:bg-zinc-950/20 border border-border dark:border-primary-800"
              >
                <div className="flex items-center gap-1 min-w-0 group">
                  <span className="text-sm text-text-primary dark:text-zinc-100 truncate leading-none">
                    {entry.username}
                  </span>
                  <button
                    onClick={() => handleRemovePending(entry.userId)}
                    className="p-1.5 text-neutral hover:text-error rounded hover:bg-primary-50 dark:hover:bg-zinc-700/50 flex-shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                    title={t('common.delete')}
                  >
                    <MdClose className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex-1" />
                <select
                  value={entry.level}
                  onChange={(e) =>
                    handlePendingLevelChange(
                      entry.userId,
                      e.target.value as 'read-only' | 'read-write'
                    )
                  }
                  aria-label={t('home.permissionLevel')}
                  className="h-8 w-24 rounded border border-border dark:border-zinc-700 bg-bg dark:bg-zinc-800 text-text-primary dark:text-zinc-100 px-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="read-only">{t('home.readOnly')}</option>
                  <option value="read-write">{t('home.readWrite')}</option>
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-2 pt-2 border-t border-border dark:border-zinc-800">
        <Button variant="outline" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button onClick={handleSubmit} disabled={!hasPending || grantPermission.isPending}>
          {grantPermission.isPending ? t('common.loading') : t('common.confirm')}
        </Button>
      </div>
    </div>
  );
}
