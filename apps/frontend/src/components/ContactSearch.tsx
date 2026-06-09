import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchUsers, useSendInvitation } from '../hooks/useApi';
import type { Contact } from '../hooks/useApi';

interface ContactSearchProps {
  onSelect?: (contact: Contact) => void;
  mode?: 'search' | 'invite';
}

export function ContactSearch({ onSelect, mode = 'search' }: ContactSearchProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Contact[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const searchUsers = useSearchUsers();
  const sendInvitation = useSendInvitation();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (debouncedQuery.length >= 2) {
      searchUsers.mutate(debouncedQuery, {
        onSuccess: (data) => {
          setResults(data as unknown as Contact[]);
          setIsOpen(true);
          setActiveIndex(-1);
        },
      });
    } else {
      setResults([]);
      setIsOpen(false);
      setActiveIndex(-1);
    }
  // oxlint-disable-next-line react-hooks/exhaustive-deps — searchUsers mutation identity unstable
  }, [debouncedQuery]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && itemRefs.current[activeIndex]) {
      itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const close = useCallback(() => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  const handleSelect = (contact: Contact) => {
    if (mode === 'invite') {
      sendInvitation.mutateAsync(contact.id).then(() => close());
    } else if (onSelect) {
      onSelect(contact);
      close();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => (i < results.length - 1 ? i + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => (i > 0 ? i - 1 : results.length - 1));
        break;
      case 'Enter':
        if (activeIndex >= 0 && activeIndex < results.length) {
          e.preventDefault();
          handleSelect(results[activeIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
    }
  };

  return (
    <div className="relative">
      <input
        type="text"
        role="combobox"
        aria-label={t('home.searchUsers')}
        aria-expanded={isOpen}
        aria-controls="contact-search-listbox"
        aria-activedescendant={activeIndex >= 0 ? `contact-option-${activeIndex}` : undefined}
        aria-autocomplete="list"
        placeholder={t('home.addContact')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        className="w-full h-8 rounded-sm border border-border dark:border-zinc-700 bg-bg dark:bg-zinc-800 text-text-primary dark:text-zinc-100 px-3 py-1.5 text-sm placeholder:text-neutral dark:placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
      />

      {isOpen && results.length > 0 && (
        <div
          role="listbox"
          id="contact-search-listbox"
          aria-label={t('home.searchResults')}
          className="absolute z-10 w-full mt-1 bg-bg dark:bg-zinc-900 border border-border dark:border-zinc-800 max-h-60 overflow-y-auto rounded-sm"
        >
          {results.map((user, index) => (
            <button
              key={user.id}
              ref={(el) => { itemRefs.current[index] = el; }}
              role="option"
              aria-selected={index === activeIndex}
              id={`contact-option-${index}`}
              onClick={() => handleSelect(user)}
              onMouseEnter={() => setActiveIndex(index)}
              disabled={mode === 'invite' && sendInvitation.isPending}
              className="w-full px-4 py-3 text-left hover:bg-surface dark:hover:bg-zinc-800 border-b border-primary-100 dark:border-zinc-800 last:border-b-0 disabled:opacity-50 aria-selected:bg-primary/10 dark:aria-selected:bg-primary/20"
            >
              <div className="font-medium text-text-primary dark:text-zinc-100">
                {user.username}
              </div>
              <div className="text-sm text-text-secondary dark:text-zinc-400">{user.email}</div>
              {user.phone && (
                <div className="text-xs text-neutral dark:text-zinc-400">{user.phone}</div>
              )}
              {mode === 'invite' && (
                <span className="text-xs text-primary-600 dark:text-zinc-400 mt-1 block">
                  {t('home.addContact')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {isOpen && debouncedQuery.length >= 2 && results.length === 0 && !searchUsers.isPending && (
        <div
          role="status"
          className="absolute z-10 w-full mt-1 bg-bg dark:bg-zinc-900 border border-border dark:border-zinc-800 p-4 text-center text-sm text-text-secondary dark:text-zinc-400 rounded-sm"
        >
          {t('home.noSearchResults', { query: debouncedQuery })}
        </div>
      )}
    </div>
  );
}
