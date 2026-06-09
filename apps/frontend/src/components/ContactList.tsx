import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useContacts, useRemoveContact } from '../hooks/useApi';
import type { Contact } from '../hooks/useApi';
import { compareTimestamps } from '../lib/dateFormat';
import { MdPersonRemove, MdManageAccounts, MdPeople } from 'react-icons/md';
import { Button } from '@/components/ui/button';
import { SkeletonContactCard } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface ContactListProps {
  viewMode?: 'list' | 'grid';
  sortMode?: 'name' | 'joined';
  searchQuery?: string;
  onSelect?: (contact: Contact) => void;
  onRemove?: (contactId: string) => void;
  onPermissionChange?: (contact: Contact) => void;
}

export function ContactList({
  viewMode = 'list',
  sortMode = 'joined',
  searchQuery = '',
  onSelect,
  onRemove,
  onPermissionChange,
}: ContactListProps) {
  const { t } = useTranslation();
  const { data: contacts = [], isLoading } = useContacts();
  const removeContact = useRemoveContact();
  const [removeConfirm, setRemoveConfirm] = useState<Contact | null>(null);

  const sorted = useMemo(() => {
    let arr = [...contacts];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      arr = arr.filter(
        (c) =>
          c.username.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q))
      );
    }
    if (sortMode === 'name') {
      arr.sort((a, b) => a.username.localeCompare(b.username));
    } else {
      arr.sort((a, b) => compareTimestamps(b.addedAt, a.addedAt));
    }
    return arr;
  }, [contacts, sortMode, searchQuery]);

  const handleRemove = (contact: Contact, e: React.MouseEvent) => {
    e.stopPropagation();
    setRemoveConfirm(contact);
  };

  const confirmRemove = () => {
    if (!removeConfirm) return;
    removeContact.mutate(removeConfirm.id, {
      onSuccess: () => onRemove?.(removeConfirm.id),
    });
    setRemoveConfirm(null);
  };

  const handlePermission = (contact: Contact, e: React.MouseEvent) => {
    e.stopPropagation();
    onPermissionChange?.(contact);
  };

  if (isLoading) {
    return (
      <div
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
        aria-hidden="true"
      >
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonContactCard key={i} />
        ))}
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <MdPeople className="h-12 w-12 mx-auto mb-3 text-primary-300 dark:text-primary-600" />
          <p className="text-sm text-text-secondary dark:text-zinc-400">{t('home.noContacts')}</p>
        </div>
      </div>
    );
  }

  if (viewMode === 'grid') {
    return (
      <>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {sorted.map((contact: Contact) => (
            <div
              key={contact.id}
              onClick={() => onSelect?.(contact)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect?.(contact);
                }
              }}
              role="button"
              tabIndex={0}
              className="flex flex-col items-center p-4 bg-bg dark:bg-zinc-900 border border-border dark:border-zinc-800 hover:border-primary-300 dark:hover:border-primary-700 transition-all active:scale-[0.98] cursor-pointer text-center"
            >
              <div className="w-11 h-11 bg-primary rounded-full flex items-center justify-center text-white font-semibold text-lg mb-2 shrink-0">
                {contact.username.charAt(0).toUpperCase()}
              </div>
              <p className="text-sm font-semibold text-text-primary dark:text-zinc-100 truncate w-full">
                {contact.username}
              </p>
              {contact.email ? (
                <p className="text-[12px] text-text-secondary dark:text-zinc-400 truncate w-full mt-0.5">
                  {contact.email}
                </p>
              ) : null}
              <p className="text-[12px] text-text-secondary dark:text-zinc-400 truncate w-full mt-0.5">
                {contact.phone || t('home.phoneNotSet')}
              </p>
              <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border dark:border-zinc-800 w-full justify-center">
                <button
                  onClick={(e) => handlePermission(contact, e)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[12px] text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-zinc-800 transition-colors"
                  title={t('home.managePermission')}
                >
                  <MdManageAccounts className="h-3.5 w-3.5" />
                  <span>{t('home.managePermission')}</span>
                </button>
                <button
                  onClick={(e) => handleRemove(contact, e)}
                  disabled={removeContact.isPending}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[12px] text-neutral dark:text-zinc-400 hover:text-error dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                  title={t('home.removeContact')}
                >
                  <MdPersonRemove className="h-3.5 w-3.5" />
                  <span>{t('home.removeContact')}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
        {/* Remove confirmation dialog */}
        <Dialog open={removeConfirm !== null} onOpenChange={() => setRemoveConfirm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('home.removeContact')}</DialogTitle>
            </DialogHeader>
            <div className="p-4 text-sm text-text-primary dark:text-zinc-100">
              {removeConfirm && t('home.removeContactConfirm', { name: removeConfirm.username })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRemoveConfirm(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={confirmRemove}
                disabled={removeContact.isPending}
              >
                {removeContact.isPending ? t('common.loading') : t('home.removeContact')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // List view
  return (
    <>
      <div className="space-y-1">
        {sorted.map((contact: Contact) => (
          <div
            key={contact.id}
            onClick={() => onSelect?.(contact)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect?.(contact);
              }
            }}
            role="button"
            tabIndex={0}
            className="flex items-center justify-between p-3 bg-bg dark:bg-zinc-900 border border-border dark:border-zinc-800 hover:bg-primary-50 dark:hover:bg-zinc-800 cursor-pointer group transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center text-white font-semibold shrink-0">
                {contact.username.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm text-text-primary dark:text-zinc-100 truncate">
                  {contact.username}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {contact.email && (
                    <span className="text-[12px] text-text-secondary dark:text-zinc-400 truncate">
                      {contact.email}
                    </span>
                  )}
                  <span className="text-[12px] text-text-secondary dark:text-zinc-400 truncate">
                    {contact.phone || t('home.phoneNotSet')}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              <button
                onClick={(e) => handlePermission(contact, e)}
                className="p-1.5 rounded text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-zinc-900 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all"
                title={t('home.managePermission')}
              >
                <MdManageAccounts className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => handleRemove(contact, e)}
                disabled={removeContact.isPending}
                className="p-1.5 rounded text-neutral dark:text-zinc-400 hover:text-error dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all disabled:opacity-50"
                title={t('home.removeContact')}
              >
                <MdPersonRemove className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {/* Remove confirmation dialog */}
      <Dialog open={removeConfirm !== null} onOpenChange={() => setRemoveConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('home.removeContact')}</DialogTitle>
          </DialogHeader>
          <div className="p-4 text-sm text-text-primary dark:text-zinc-100">
            {removeConfirm && t('home.removeContactConfirm', { name: removeConfirm.username })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveConfirm(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmRemove}
              disabled={removeContact.isPending}
            >
              {removeContact.isPending ? t('common.loading') : t('home.removeContact')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
