import { useState, useEffect, useRef, useCallback, createElement, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import type { CollaborativeEditor as CollaborativeEditorType } from '../components/Editor/Editor';
import { useToken } from '../hooks/useToken';
import { useUser } from '../hooks/useApi';
import { useNotificationSocket } from '../hooks/useNotificationSocket';
import { useThemeStore, useLanguageStore } from '../store/index';
import { tokenStore } from '../lib/tokenStore';
import { apiFetch } from '../lib/apiClient';
import { useToast } from '../components/ui/toast';
import { DocumentList } from '../components/DocumentList';
import { PermissionChangeModal } from '../components/PermissionChangeModal';
import { OnlineUsers } from '../components/OnlineUsers';
import { PageSpinner } from '../components/ui/spinner';
import {
  MdDescription,
  MdMenuOpen,
  MdMenu,
  MdLightMode,
  MdDarkMode,
  MdTranslate,
  MdArrowBack,
} from 'react-icons/md';
import type { OnlineUser } from '../types/models';

interface DocumentEditorPageProps {
  fileId?: string;
}

// ── Lazy-load the editor engine (~1.4MB) separately from the page chrome ──
// The page sidebar, toolbar, and layout render immediately while the Milkdown
// editor bundle downloads. Module-level cache ensures the import only happens once.
let _EditorEngine: ComponentType<any> | null = null;
let _EditorEnginePromise: Promise<ComponentType<any>> | null = null;

function LazyCollaborativeEditor(props: Record<string, unknown>) {
  const [Comp, setComp] = useState<ComponentType<any> | null>(() => _EditorEngine);
  useEffect(() => {
    if (_EditorEngine) return;
    let cancelled = false;
    if (!_EditorEnginePromise) {
      _EditorEnginePromise = import('../components/Editor/Editor').then((m) => {
        _EditorEngine = m.CollaborativeEditor;
        return m.CollaborativeEditor;
      });
    }
    _EditorEnginePromise.then((c) => {
      if (!cancelled) setComp(() => c);
    });
    return () => { cancelled = true; };
  }, []);

  if (!Comp) {
    return createElement(
      'div',
      { className: 'flex flex-col items-center justify-center h-full gap-3 text-text-secondary dark:text-zinc-400' },
      createElement(PageSpinner),
      createElement('span', { className: 'text-sm' }, 'Loading editor…')
    );
  }
  return createElement(Comp, props);
}

export function DocumentEditorPage({ fileId: propFileId }: DocumentEditorPageProps = {}) {
  const { t, i18n } = useTranslation();
  const { fileId: paramFileId } = useParams();
  const fileId = propFileId || paramFileId;
  const navigate = useNavigate();
  const { isAuthenticated, isAuthLoading } = useToken();
  const { data: currentUser } = useUser();
  const { theme, setTheme } = useThemeStore();
  const { language, setLanguage } = useLanguageStore();
  const { addToast } = useToast();

  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');
  const toggleLanguage = () => {
    const next = language === 'zh' ? 'en' : 'zh';
    setLanguage(next);
    i18n.changeLanguage(next);
  };

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [permissionLevel, setPermissionLevel] = useState<string | null>(null);
  const [documentTitle, setDocumentTitle] = useState('');
  const [permModal, setPermModal] = useState<{
    type: 'permission-revoked' | 'permission-changed';
    documentTitle: string;
  } | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const resizingRef = useRef(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const next = Math.min(480, Math.max(200, startWidth + ev.clientX - startX));
      setSidebarWidth(next);
    };
    const onUp = () => {
      resizingRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [sidebarWidth]);

  // Notification WebSocket — handles permission changes + document deletion in real-time
  useNotificationSocket((msg) => {
    if (msg.data.documentId === fileId) {
      if (msg.type === 'permission-revoked') {
        // Immediately set permission to revoked so the editor switches to read-only
        setPermissionLevel('revoked');
        setPermModal({ type: msg.type, documentTitle: String(msg.data.documentTitle || '') });
        addToast(t('home.permissionRevokedToast', { title: msg.data.documentTitle }), 'warning');
      } else if (msg.type === 'permission-changed') {
        // Re-fetch the new permission level from the server
        setPermModal({ type: msg.type, documentTitle: String(msg.data.documentTitle || '') });
        addToast(t('home.permissionChangedToast', { title: msg.data.documentTitle }), 'info');
        apiFetch(`/api/permissions/${fileId}/access`)
          .then((r) => r.json())
          .then((j) => {
            if (j.success && j.data) setPermissionLevel(j.data.level);
          })
          .catch(() => setPermissionLevel('read-only')); // safety fallback
      } else if (msg.type === 'document-deleted') {
        // Document was deleted by the owner — redirect immediately
        addToast(t('home.documentDeletedToast', { title: msg.data.documentTitle || '' }), 'warning');
        navigate('/', { replace: true });
      }
    }
  });

  useEffect(() => {
    if (!fileId || !tokenStore.accessToken) return;
    let cancelled = false;
    apiFetch(`/api/documents/${fileId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.success && j.data) {
          setDocumentTitle(j.data.title || '');
          if (currentUser?.id && j.data.ownerId) {
            setIsOwner(currentUser.id === j.data.ownerId);
          }
        }
      })
      .catch((err) => {
        // Document fetch failed — title will show fileId fallback
        if (import.meta.env.DEV) console.error('Document fetch failed:', err);
        addToast(t('error.fetchFailed'), 'error');
      });
    // Fetch permission level to enforce read-only mode
    apiFetch(`/api/permissions/${fileId}/access`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.success && j.data) {
          setPermissionLevel(j.data.level);
        }
      })
      .catch((err) => {
        // Permission fetch failed — default to read-only for safety
        if (import.meta.env.DEV) console.error('Permission fetch failed:', err);
        addToast(t('error.fetchFailed'), 'error');
        setPermissionLevel('read-only');
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, isAuthenticated, currentUser?.id]);  // oxlint-disable-line react-hooks/exhaustive-deps — addToast and t are stable

  // Auth guard is handled at the router level (main.tsx AuthGuard),
  // so by the time this component renders, the user is authenticated.
  if (isAuthLoading) {
    return <PageSpinner />;
  }

  if (!fileId) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg dark:bg-zinc-950">
        <div className="text-error dark:text-red-400 text-lg">{t('error.notFoundTitle')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-bg dark:bg-zinc-950">
      <a href="#editor-main" className="skip-to-main">
        {t('common.skipToMain')}
      </a>
      {/* Header */}
      <header className="bg-surface/80 dark:bg-zinc-900/80 backdrop-blur border-b border-border dark:border-zinc-800 px-4 py-2 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          {/* Sidebar Toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 text-text-secondary dark:text-zinc-400 hover:bg-surface dark:hover:bg-zinc-800 transition-colors"
            aria-label={sidebarOpen ? t('common.close') : t('editor.documentList')}
          >
            {sidebarOpen ? <MdMenuOpen className="h-5 w-5" /> : <MdMenu className="h-5 w-5" />}
          </button>

          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1 whitespace-nowrap text-text-secondary dark:text-zinc-400 hover:text-primary-700 dark:hover:text-zinc-300 text-[15px] transition-colors"
            aria-label={t('editor.back')}
          >
            <MdArrowBack className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{t('editor.back')}</span>
          </button>

          <span className="text-primary-300 dark:text-zinc-400 hidden sm:inline">|</span>

          <h1 className="font-display tracking-tight font-bold text-text-primary dark:text-zinc-100 truncate max-w-[200px] sm:max-w-md text-[16px]">
            {documentTitle || t('editor.document')}
          </h1>
        </div>

        {/* Online users + Language & Theme Toggles */}
        <div className="flex items-center gap-2">
          <OnlineUsers users={onlineUsers} />
          <div className="flex items-center gap-1">
            <button
              onClick={toggleLanguage}
              className="p-2 text-text-secondary dark:text-zinc-400 hover:bg-surface dark:hover:bg-zinc-800 transition-colors flex items-center gap-1"
              aria-label={language === 'zh' ? t('home.switchToEnglish') : t('home.switchToChinese')}
            >
              <MdTranslate className="h-4 w-4" />
              <span className="text-[13px] font-medium hidden sm:inline">
                {language === 'zh' ? t('home.chinese') : t('home.english')}
              </span>
            </button>
            <button
              onClick={toggleTheme}
              className="p-1.5 text-text-secondary dark:text-zinc-400 hover:bg-surface dark:hover:bg-zinc-800 transition-colors"
              aria-label={theme === 'light' ? t('home.dark') : t('home.light')}
            >
              {theme === 'light' ? (
                <MdLightMode className="h-4 w-4" />
              ) : (
                <MdDarkMode className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Editor Content */}
      <main id="editor-main" className="flex-1 flex overflow-hidden relative">
        {/* Document List Sidebar — overlay on mobile, inline on desktop */}
        {sidebarOpen && (
          <>
            <aside
              style={{ width: sidebarWidth }}
              className="absolute inset-y-0 left-0 z-20 flex-shrink-0 md:relative border-r border-border dark:border-zinc-800 bg-bg dark:bg-zinc-900 flex flex-col"
            >
              <div className="p-3 border-b border-border dark:border-zinc-800 flex items-center justify-between">
                <h2 className="font-semibold text-text-primary dark:text-zinc-100 text-[15px] flex items-center gap-2">
                  <MdDescription className="h-4 w-4 text-neutral" />
                  {t('editor.documentList')}
                </h2>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="md:hidden p-1 text-neutral hover:text-text-primary"
                  aria-label={t('common.close')}
                >
                  <MdMenu className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 min-h-0 p-2">
                <DocumentList
                  onFileSelect={(docId) => navigate(`/editor/${docId}`)}
                  showEditingStatus
                  activeFileId={fileId}
                />
              </div>
              {/* Resize handle — desktop only (mouse + keyboard) */}
              <div
                className="hidden md:block absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary/30 transition-colors"
                role="separator"
                aria-orientation="vertical"
                aria-valuenow={sidebarWidth}
                aria-valuemin={200}
                aria-valuemax={480}
                aria-label="Resize sidebar"
                tabIndex={0}
                onMouseDown={handleResizeStart}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') setSidebarWidth(w => Math.max(200, w - 40));
                  if (e.key === 'ArrowRight') setSidebarWidth(w => Math.min(480, w + 40));
                }}
              />
            </aside>
            {/* Mobile backdrop */}
            <div
              className="md:hidden absolute inset-0 z-10 bg-zinc-900/50"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
          </>
        )}

        {/* Editor Panel */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <LazyCollaborativeEditor
            documentId={fileId}
            language={language}
            userName={currentUser?.username}
            onUsersChange={setOnlineUsers}
            readOnly={permissionLevel === 'read-only'}
          />
        </div>
      </main>

      {/* Permission Change Modal — blocks interaction during countdown */}
      <PermissionChangeModal
        type={permModal?.type || 'permission-revoked'}
        documentTitle={permModal?.documentTitle || ''}
        open={permModal !== null}
      />
    </div>
  );
}
