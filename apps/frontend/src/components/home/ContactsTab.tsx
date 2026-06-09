import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ContactList } from '../ContactList';
import { ContactSearch } from '../ContactSearch';
import { ContactPermissionDialog } from '../ContactPermissionDialog';
import { MdPersonAdd, MdSwapVert, MdSearch, MdClose } from 'react-icons/md';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useSendInvitation } from '../../hooks/useApi';
import { useToast } from '../ui/toast';
import type { Contact } from '../../hooks/useApi';

type ContactSortMode = 'name' | 'joined';

export function ContactsTab() {
  const { t } = useTranslation();
  const [sortMode, setSortMode] = useState<ContactSortMode>('joined');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [permDialog, setPermDialog] = useState<{ contactId: string; contactName: string } | null>(
    null
  );
  const [selectedUser, setSelectedUser] = useState<Contact | null>(null);

  const sendInvitation = useSendInvitation();
  const { addToast } = useToast();

  const handleSelectUser = (contact: Contact) => {
    setSelectedUser(contact);
  };

  const handleConfirm = () => {
    if (selectedUser) {
      sendInvitation.mutate(selectedUser.id, {
        onSuccess: () => {
          setSelectedUser(null);
          setShowAddDialog(false);
        },
        onError: (err: Error) => {
          addToast(err.message || t('home.invitationFailed'), 'error');
        },
      });
    }
  };

  const handleCancel = () => {
    setSelectedUser(null);
    setShowAddDialog(false);
  };

  const sorts: { key: ContactSortMode; label: string }[] = [
    { key: 'joined', label: t('home.sortJoined') },
    { key: 'name', label: t('home.sortContactName') },
  ];

  return (
    <div className="bg-bg dark:bg-zinc-900 shadow flex flex-col min-h-[calc(100vh-90px)]">
      {/* Toolbar */}
      <div className="p-4 border-b border-border dark:border-zinc-800 flex items-center justify-between gap-4">
        {/* Left: add contact */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowAddDialog(true)}
            className="p-2 rounded hover:bg-primary-50 dark:hover:bg-zinc-800 text-primary-600"
            title={t('home.addContact')}
            aria-label={t('home.addContact')}
          >
            <MdPersonAdd className="h-4 w-4" />
          </button>
        </div>

        {/* Right: search, sort */}
        <div className="flex items-center gap-1">
          {/* Search */}
          {showSearch ? (
            <div className="relative w-full max-w-[200px]">
              <MdSearch className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral dark:text-zinc-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label={t('home.searchContacts')}
                placeholder={t('home.searchContacts')}
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
              title={t('home.searchContacts')}
              aria-label={t('home.searchContacts')}
            >
              <MdSearch className="h-4 w-4" />
            </button>
          )}

          {/* Sort */}
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="p-1.5 rounded hover:bg-primary-50 dark:hover:bg-zinc-800 text-primary-600 dark:text-zinc-300"
              title={sorts.find((s) => s.key === sortMode)?.label}
              aria-label={t('home.sortContactName')}
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
      <div className="flex-1 flex flex-col overflow-auto p-4">
        <ContactList
          viewMode="grid"
          sortMode={sortMode}
          searchQuery={searchQuery}
          onPermissionChange={(contact) => {
            setPermDialog({ contactId: contact.id, contactName: contact.username });
          }}
        />
      </div>

      {/* Add Contact Dialog */}
      <Dialog
        open={showAddDialog}
        onOpenChange={(open) => {
          if (!open) handleCancel();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('home.searchUsers')}</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <ContactSearch onSelect={handleSelectUser} mode="search" />
            {selectedUser && (
              <p className="mt-2 text-sm text-primary-600 dark:text-zinc-400">
                {t('home.selected')}:{' '}
                <span className="font-medium text-text-primary dark:text-zinc-100">
                  {selectedUser.username}
                </span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleConfirm} disabled={!selectedUser || sendInvitation.isPending}>
              {sendInvitation.isPending ? t('common.loading') : t('home.addContact')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Permission Dialog */}
      {permDialog && (
        <ContactPermissionDialog
          open={true}
          contactId={permDialog.contactId}
          contactName={permDialog.contactName}
          onClose={() => setPermDialog(null)}
        />
      )}
    </div>
  );
}
