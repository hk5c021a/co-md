import { useEffect, useRef, useState, useCallback, Component } from 'react';
import { useTranslation } from 'react-i18next';
import type { OnlineUser } from '../../types/models';
import { Milkdown, MilkdownProvider, useEditor, useInstance } from '@milkdown/react';
import '@milkdown/crepe/theme/classic.css';
import '@milkdown/crepe/theme/common/style.css';
import './editor.css';

// Error boundary to catch Milkdown context errors gracefully
// Inner class component — React 19 requires class components for error boundaries
class EditorErrorBoundaryInner extends Component<
  { children: React.ReactNode; t: ReturnType<typeof useTranslation>['t'] },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode; t: ReturnType<typeof useTranslation>['t'] }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-text-secondary dark:text-zinc-400 text-sm">
          <p>{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 rounded-md bg-primary text-white text-sm hover:brightness-110 transition-all"
          >
            {this.props.t('error.reloadPage')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Function wrapper — injects i18n into the class-based error boundary */
export function EditorErrorBoundary({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return <EditorErrorBoundaryInner t={t}>{children}</EditorErrorBoundaryInner>;
}

import { Crepe } from '@milkdown/crepe';
import { collab, collabServiceCtx } from '@milkdown/plugin-collab';
import { highlight, highlightPluginConfig } from '@milkdown/plugin-highlight';
import type { Highlighter } from 'shiki';
import { replaceAll } from '@milkdown/utils';
import { editorViewOptionsCtx, type Editor } from '@milkdown/core';

// ═══ Shiki highlighter (lazy-loaded, languages loaded on demand) ═══
// Shiki v4 bundle-full registers all 200+ languages as lazy () => import(...) getters.
// We create the highlighter with no preloaded languages, then scan the document
// for code-fence languages and load only what's actually used.
// This keeps the initial load lean (~0KB grammars) while supporting any language.
let _highlighter: Highlighter | null = null;
let _highlighterPromise: Promise<Highlighter> | null = null;
function getHighlighter() {
  if (!_highlighterPromise) {
    _highlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({ themes: ['nord'], langs: [] })
    ).then((h) => {
      _highlighter = h;
      return h;
    });
  }
  return _highlighterPromise;
}

/** Scan markdown for code-fence languages and load them on demand. */
let _highlightSetup = false; // guard: only set up highlighting once per editor lifecycle

async function loadDocumentLanguages(hl: Highlighter, markdown: string) {
  const fenceLangs = new Set<string>();
  for (const m of markdown.matchAll(/```(\w+)/g)) fenceLangs.add(m[1].toLowerCase());
  const loaded = new Set(hl.getLoadedLanguages());
  // Shiki v4: getBundledLanguages() returns Record<string, LanguageInput> (plain object).
  // Use Object.keys() since plain objects are not iterable.
  const bundled = new Set(Object.keys(hl.getBundledLanguages?.() ?? {}));
  const toLoad = [...fenceLangs].filter(l => !loaded.has(l) && bundled.has(l));
  if (toLoad.length > 0) await hl.loadLanguage(...toLoad);
  return toLoad.length > 0;
}

function buildCrepeConfig(t: ReturnType<typeof useTranslation>['t'], documentId: string, readOnly: boolean) {
  // Crepe editor translations — sourced from react-i18next so they stay in sync
  // with the global language setting (zh.ts / en.ts).
  const ct = (key: string) => t(`editorCrepe.${key}`, '') || undefined;
  return {
    features: { 'top-bar': !readOnly },
    featureConfigs: {
      placeholder: ct('placeholderText') ? { text: ct('placeholderText') } : undefined,
      'link-tooltip': ct('linkPlaceholder')
        ? { inputPlaceholder: ct('linkPlaceholder') }
        : undefined,
      'code-mirror': ct('searchLanguage')
        ? {
            searchPlaceholder: ct('searchLanguage'),
            noResultText: ct('noResultText'),
            copyText: ct('copyText'),
          }
        : undefined,
      'top-bar': ct('paragraph')
        ? {
            headingOptions: [
              { label: ct('paragraph'), level: null },
              { label: ct('heading1'), level: 1 },
              { label: ct('heading2'), level: 2 },
              { label: ct('heading3'), level: 3 },
              { label: ct('heading4'), level: 4 },
              { label: ct('heading5'), level: 5 },
              { label: ct('heading6'), level: 6 },
            ],
          }
        : undefined,
      'image-block': {
        onUpload: async (file: File) => {
          const form = new FormData();
          form.append('file', file);
          form.append('documentId', documentId);
          const res = await apiFetch('/api/upload', {
            method: 'POST',
            body: form,
          });
          if (!res.ok) throw new Error('Upload failed');
          const { data } = await res.json();
          return data.url;
        },
      },
      'block-edit': ct('textGroupLabel')
        ? {
            textGroup: {
              label: ct('textGroupLabel'),
              text: { label: ct('paragraph') },
              h1: { label: ct('heading1') },
              h2: { label: ct('heading2') },
              h3: { label: ct('heading3') },
              h4: { label: ct('heading4') },
              h5: { label: ct('heading5') },
              h6: { label: ct('heading6') },
              quote: { label: ct('quote') },
              divider: { label: ct('divider') },
            },
            listGroup: {
              label: ct('listGroupLabel'),
              bulletList: { label: ct('bulletList') },
              orderedList: { label: ct('orderedList') },
              taskList: { label: ct('taskList') },
            },
            advancedGroup: {
              label: ct('advancedGroupLabel'),
              image: { label: ct('image') },
              codeBlock: { label: ct('codeBlock') },
              table: { label: ct('table') },
              math: { label: ct('mathFormula') },
            },
          }
        : undefined,
    },
  };
}
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { writeUpdate, readSyncMessage } from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import { tokenStore } from '../../lib/tokenStore';
import { API_BASE, getWsBase, apiFetch } from '../../lib/apiClient';
import { useToast } from '../ui/toast';

// ═══ Token ═══
function buildWsUrl(base: string, docId: string): string {
  return `${base}/${encodeURIComponent(docId)}`;
}
let _rfPromise: Promise<string | null> | null = null,
  _lastRf = 0;
async function refreshAccessToken(): Promise<string | null> {
  const n = Date.now();
  if (_rfPromise && n - _lastRf < 60000) return _rfPromise;
  if (n - _lastRf < 30000) {
    return tokenStore.accessToken;
  }
  _lastRf = n;
  _rfPromise = (async () => {
    try {
      const at = await tokenStore.getAccessToken();
      if (at) {
        tokenStore.accessToken = at;
        return at;
      }
    } catch {
      /* refresh failed — return null */
    }
    return null;
  })();
  _rfPromise.finally(() => {
    if (Date.now() - _lastRf > 60000) _rfPromise = null;
  });
  return _rfPromise;
}

// ═══ Milkdown editor with WS + Yjs ═══
interface CollaborativeEditorProps {
  documentId: string;
  wsUrl?: string;
  onContentChange?: (c: string) => void;
  readOnly?: boolean;
  language?: string;
  userName?: string;
  onUsersChange?: (users: OnlineUser[]) => void;
}

function MilkdownInner({
  ydoc,
  language,
  documentId,
  awareness,
  onMarkdownChange,
  onReady,
  readOnly = false,
}: {
  ydoc: Y.Doc;
  language?: string;
  documentId: string;
  awareness?: awarenessProtocol.Awareness;
  onMarkdownChange?: (md: string) => void;
  onReady?: (editor: Editor) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const onMarkdownChangeRef = useRef(onMarkdownChange);
  onMarkdownChangeRef.current = onMarkdownChange;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  useEditor(
    (root) => {
      const ro = readOnlyRef.current;
      const crepe = new Crepe({ root, ...buildCrepeConfig(t, documentId, ro) });
      // Start shiki lazy-load (no languages preloaded — loaded on demand from doc)
      _highlightSetup = false;
      if (!ro && !_highlighter) getHighlighter().then((hl) => { _highlighter = hl; });

      crepe.editor.use(collab);

      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          onMarkdownChangeRef.current?.(markdown);
          // Load code-fence languages on demand, set up highlighting once
          if (!ro && _highlighter && !_highlightSetup) {
            _highlightSetup = true;
            loadDocumentLanguages(_highlighter, markdown).then(() => {
              import('prosemirror-highlight/shiki').then(({ createParser }) => {
                crepe.editor.config((ctx) => {
                  ctx.set(highlightPluginConfig.key, { parser: createParser(_highlighter!) });
                });
                crepe.editor.use(highlight);
              });
            });
          }
        });
      });
      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          onMarkdownChangeRef.current?.(markdown);
        });
      });
      return crepe;
    },
    [language, readOnly]
  );

  const [loading, getInstance] = useInstance();
  const collabBound = useRef(false);
  const collabServiceRef = useRef<any>(null);
  const prevEditorRef = useRef<any>(null);
  const yjsUpdateCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (loading) return;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tryBindCollab = () => {
      const editor = getInstance();
      if (!editor) {
        if (++attempts < 30) timer = setTimeout(tryBindCollab, 200);
        return;
      }

      // Disconnect previous collab binding when editor changes
      if (editor !== prevEditorRef.current) {
        if (prevEditorRef.current) {
          try {
            const prevService = prevEditorRef.current.ctx.get(collabServiceCtx);
            prevService.disconnect();
          } catch {
            /* ignore */
          }
        }
        prevEditorRef.current = editor;
        collabBound.current = false;
      }

      if (!collabBound.current) {
        collabBound.current = true;
        const service = editor.ctx.get(collabServiceCtx);
        collabServiceRef.current = service;
        if (awareness) service.setAwareness(awareness);
        service.bindDoc(ydoc).connect();
        onReadyRef.current?.(editor);
      }

      // Listen for Yjs updates (both local and remote) to capture merged markdown
      yjsUpdateCleanupRef.current?.();
      yjsUpdateCleanupRef.current = null;
      const handler = () => {
        setTimeout(() => {
          try {
            const currentEditor = getInstance();
            if (!currentEditor) return;
            const md = currentEditor.action(getMarkdown());
            if (md) onMarkdownChangeRef.current?.(md);
          } catch {
            /* editor might not be ready */
          }
        }, 50);
      };
      ydoc.on('update', handler);
      yjsUpdateCleanupRef.current = () => ydoc.off('update', handler);
    };
    timer = setTimeout(tryBindCollab, 100);
    return () => clearTimeout(timer);
  }, [loading, ydoc, getInstance, awareness]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        collabServiceRef.current?.disconnect();
      } catch {
        /* ignore */
      }
      yjsUpdateCleanupRef.current?.();
      yjsUpdateCleanupRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-full">
      <Milkdown />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg dark:bg-zinc-950 text-neutral text-[15px] z-10">
          {t('editor.loadingEditor')}
        </div>
      )}
    </div>
  );
}

export function CollaborativeEditor({
  documentId,
  wsUrl = getWsBase(),
  onContentChange,
  readOnly = false,
  language,
  userName,
  onUsersChange,
}: CollaborativeEditorProps) {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const editorRef = useRef<HTMLDivElement>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const persistenceRef = useRef<IndexeddbPersistence | null>(null);
  const awarenessRef = useRef<awarenessProtocol.Awareness | null>(null);
  const connectionIdRef = useRef<number>(0); // Y.Doc clientID = unique per mount
  const userNameRef = useRef(userName);
  userNameRef.current = userName;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const onUsersChangeRef = useRef(onUsersChange);
  onUsersChangeRef.current = onUsersChange;
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const tokenRef = useRef(tokenStore.accessToken);
  const switchingRef = useRef(false);
  const onMessageRef = useRef<((e: MessageEvent) => void) | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const pendingMarkdownRef = useRef('');
  const apiFallbackRef = useRef('');
  const apiYjsFallbackRef = useRef<string | null>(null);

  const connectWs = useCallback((url: string, ydoc: Y.Doc, onMsg: (e: MessageEvent) => void) => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    switchingRef.current = false;
    onMessageRef.current = onMsg;
    const token = tokenRef.current || '';
    // NOTE: The access token is passed via the Sec-WebSocket-Protocol header as
    // `token.<jwt>`. Ensure any reverse proxy (Caddy/Nginx) is configured to NOT
    // log this header, as it contains a sensitive bearer token.
    const ws = new WebSocket(url, [`token.${token}`]);
    wsRef.current = ws;
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      setIsConnected(true);
      reconnectAttempts.current = 0;
    };
    ws.onmessage = (e) => {
      onMsg(e);
    };
    ws.onclose = (e) => {
      setIsConnected(false);
      if (e.code === 4001) {
        if (reconnectAttempts.current >= 2) {
          addToast(t('auth.sessionExpired'), 'error');
          return;
        }
        reconnectAttempts.current++;
        const old = tokenRef.current;
        refreshAccessToken().then((nt) => {
          if (nt && nt !== old) {
            tokenRef.current = nt;
            connectWs(url, ydoc, onMsg);
          }
        });
      } else if (e.code !== 1000 && document.visibilityState !== 'hidden') {
        // Max 20 reconnect attempts (~17 min total), then give up
        if (reconnectAttempts.current >= 20) {
          addToast(t('editor.connectionLost'), 'error');
          return;
        }
        reconnectAttempts.current++;
        const d = Math.min(1000 * 2 ** reconnectAttempts.current, 30000) + Math.random() * 1000;
        reconnectTimer.current = setTimeout(() => connectWs(url, ydoc, onMsg), d);
      }
    };
  }, [addToast, t]);

  const switchConnection = useCallback((url: string) => {
    if (switchingRef.current) return;
    switchingRef.current = true;
    const old = wsRef.current;
    const nws = new WebSocket(url, [`token.${tokenRef.current || ''}`]);
    nws.binaryType = 'arraybuffer';
    nws.onopen = () => {
      wsRef.current = nws;
      nws.onmessage = onMessageRef.current;
      nws.onclose = old?.onclose || null;
      nws.onerror = old?.onerror || null;
      setIsConnected(true);
      switchingRef.current = false;
      if (old) {
        old.onclose = null;
        old.close(1000, 'Migrated');
      }
    };
    nws.onerror = () => {
      addToast(t('editor.saveFailed'), 'warning');
      nws.close();
      switchingRef.current = false;
    };
  }, [addToast, t]);

  // Main setup
  useEffect(() => {
    const container = editorRef.current;
    if (!container) return;
    let cancelled = false;
    setIsLoading(true);
    const setup = async () => {
      let loadedContent = '';
      try {
        const r = await apiFetch(`/api/documents/${documentId}`);
        const j = await r.json();
        if (j.success && j.data?.content) {
          const d = j.data as { content: unknown };
          if (typeof d.content === 'string') loadedContent = d.content;
          else if (typeof d.content === 'object' && d.content !== null) {
            const o = d.content as Record<string, unknown>;
            // Yjs CRDT state — decode and apply directly (skip markdown parsing)
            if (typeof o.yjsUpdate === 'string') {
              apiYjsFallbackRef.current = o.yjsUpdate;
            } else if (Array.isArray(o.ops)) {
              loadedContent = (o.ops as Record<string, unknown>[])
                .filter((op) => typeof op.insert === 'string')
                .map((op) => op.insert as string)
                .join('');
            }
          }
        }
      } catch {
        if (import.meta.env.DEV) console.error('[Editor] Failed to fetch document content from API');
      }
      if (cancelled) return;

      const ydoc = new Y.Doc();
      ydocRef.current = ydoc;
      // Track local edits for beforeunload warning
      ydoc.on('update', () => {
        dirtyRef.current = true;
      });
      const persistence = new IndexeddbPersistence(`doc-${documentId}`, ydoc);
      persistenceRef.current = persistence;

      // Apply server-persisted Yjs CRDT state if available (cross-device recovery)
      if (apiYjsFallbackRef.current) {
        try {
          const update = Uint8Array.from(atob(apiYjsFallbackRef.current), (c) => c.charCodeAt(0));
          Y.applyUpdate(ydoc, update);
        } catch {
          if (import.meta.env.DEV) console.error('[Editor] Failed to apply Yjs CRDT update from API');
        }
        apiYjsFallbackRef.current = null;
      }

      // Set up awareness for online user tracking
      const connectionId = ydoc.clientID;
      connectionIdRef.current = connectionId;
      const awareness = new awarenessProtocol.Awareness(ydoc);
      awarenessRef.current = awareness;
      const userColors = [
        '#4338CA',
        '#047857',
        '#B45309',
        '#DC2626',
        '#6D28D9',
        '#BE185D',
        '#0E7490',
        '#C2410C',
      ];
      const userColor = userColors[connectionId % userColors.length];
      const currentName = userNameRef.current;
      if (currentName) {
        awareness.setLocalStateField('user', { name: currentName, color: userColor });
      }
      const notifyUsers = () => {
        const states: OnlineUser[] = [];
        const myName = userNameRef.current;
        awareness.getStates().forEach((state, clientId) => {
          if (!state.user) return;
          const name = state.user.name || t('common.unknownUser');
          // Exclude self by connectionId
          if (clientId === connectionId) return;
          // Exclude stale self: same username, different connectionId
          if (myName && name === myName) return;
          states.push({ clientId, name, color: state.user.color || '#6366F1' });
        });
        onUsersChangeRef.current?.(states);
      };
      awareness.on('change', notifyUsers);

      // Wait for IndexedDB to load cached data (whenSynced is a built-in Promise)
      try {
        await persistence.whenSynced;
      } catch {
        /* timeout */
      }
      if (cancelled) return;

      // Store API content for fallback — applied via Milkdown replaceAll() after editor mounts
      apiFallbackRef.current = loadedContent;

      const url = buildWsUrl(wsUrl, documentId);
      tokenRef.current = tokenStore.accessToken;
      connectWs(url, ydoc, (event) => {
        if (typeof event.data === 'string') {
          try {
            const m = JSON.parse(event.data);
            if (m.type === 'token-expiring') {
              /* token expiring */
              const old = tokenRef.current;
              refreshAccessToken().then((nt) => {
                if (nt && nt !== old) {
                  tokenRef.current = nt;
                  switchConnection(buildWsUrl(wsUrl, documentId));
                }
              });
            } else if (m.type === 'permission-change') {
              /* handled by notification system */
            }
          } catch {
            if (import.meta.env.DEV) console.error('[Editor] Failed to parse WS message JSON');
          }
          return;
        }
        try {
          const arr = new Uint8Array(event.data as ArrayBuffer);
          const dec = decoding.createDecoder(arr);
          const outerType = decoding.readVarUint(dec);
          if (outerType === 0) {
            // MESSAGE_SYNC
            const enc = encoding.createEncoder();
            encoding.writeVarUint(enc, 0); // MESSAGE_SYNC (for response)
            readSyncMessage(dec, enc, ydoc, wsRef.current);
            // Send sync response (syncStep2) if encoder has data
            if (encoding.length(enc) > 1 && wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(encoding.toUint8Array(enc));
            }
          } else if (outerType === 1 && awareness) {
            // MESSAGE_AWARENESS
            awarenessProtocol.applyAwarenessUpdate(
              awareness,
              decoding.readVarUint8Array(dec),
              wsRef.current
            );
          }
        } catch {
          if (import.meta.env.DEV) console.error('[Editor] Sync apply failed');
        }
      });

      // Send local ydoc changes to WebSocket (skip updates originating from the server)
      ydoc.on('update', (update: Uint8Array, origin: unknown) => {
        if (origin === wsRef.current) return; // came from server, don't echo back
        if (readOnlyRef.current) return; // read-only users can't send changes
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const enc = encoding.createEncoder();
          encoding.writeVarUint(enc, 0); // MESSAGE_SYNC
          writeUpdate(enc, update);
          wsRef.current.send(encoding.toUint8Array(enc));
        }
      });
      // Send local awareness changes to WebSocket (cursor positions, user info)
      if (awareness) {
        awareness.on(
          'update',
          (
            { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
            origin: unknown
          ) => {
            if (origin === wsRef.current) return;
            const changed = added.concat(updated, removed);
            const aEncoder = encoding.createEncoder();
            encoding.writeVarUint(aEncoder, 1); // MESSAGE_AWARENESS
            encoding.writeVarUint8Array(
              aEncoder,
              awarenessProtocol.encodeAwarenessUpdate(awareness, changed)
            );
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(encoding.toUint8Array(aEncoder));
            }
          }
        );
      }

      setIsLoading(false);
    };
    setup();
    // ── Visibility change: reconnect WS when tab returns to foreground ──
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const ws = wsRef.current;
        if (ws && ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING) {
          const url = buildWsUrl(wsUrl, documentId);
          reconnectTimer.current = setTimeout(
            () => connectWs(url, ydocRef.current!, onMessageRef.current!),
            200
          );
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // ── beforeunload: warn if there are recent unsaved edits ──
    const dirtyRef = { current: false };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);

      // Clear awareness state so other clients see us leave before WS closes.
      // Flush synchronously — then close WS with a minimal delay for the
      // close frame to be sent. Use a beforeunload handler for the tab-close
      // path where setTimeout may not fire.
      const ws = wsRef.current;
      const aw = awarenessRef.current;
      const p = persistenceRef.current;
      const y = ydocRef.current;

      if (aw && ws?.readyState === WebSocket.OPEN) {
        aw.setLocalStateField('cursor', null);
        aw.setLocalStateField('user', null);
      }

      // On tab close, destroy resources immediately (beforeunload may not fire setTimeout)
      const onPageHide = () => {
        if (ws) { ws.onclose = null; ws.close(); }
        if (aw) aw.destroy();
        if (p) p.destroy();
        if (y) y.destroy();
      };
      window.addEventListener('pagehide', onPageHide, { once: true });

      setTimeout(() => {
        window.removeEventListener('pagehide', onPageHide);
        if (ws) {
          ws.onclose = null;
          ws.close();
        }
        if (aw) aw.destroy();
        if (p) p.destroy();
        if (y) y.destroy();
      }, 50);
    };
  // oxlint-disable-next-line react-hooks/exhaustive-deps — connectWs/switchConnection stabilized above
  }, [documentId, wsUrl]);

  // Forward token refreshes to the collaboration WebSocket (resets server-side expiry timer)
  useEffect(() => {
    const handler = (e: Event) => {
      const token = (e as CustomEvent<string>).detail;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'token-refreshed', accessToken: token }));
      }
    };
    window.addEventListener('token-refreshed', handler);
    return () => window.removeEventListener('token-refreshed', handler);
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={editorRef} className="h-full w-full overflow-auto milkdown-editor">
        {!isLoading && ydocRef.current && (
          <EditorErrorBoundary>
            <MilkdownProvider>
              <MilkdownInner
                ydoc={ydocRef.current!}
                awareness={awarenessRef.current ?? undefined}
                language={language}
                documentId={documentId}
                readOnly={readOnly}
                onReady={(editor) => {
                  // Apply API fallback content if editor is empty (no IndexedDB data)
                  const fallback = apiFallbackRef.current;
                  if (fallback) {
                    const md = editor.action(getMarkdown());
                    if (!md || md.trim() === '') {
                      editor.action(replaceAll(fallback));
                      if (onContentChange) onContentChange(fallback);
                    }
                    apiFallbackRef.current = ''; // only apply once
                  }
                }}
                onMarkdownChange={(md) => {
                  pendingMarkdownRef.current = md;
                  if (onContentChange) onContentChange(md);
                }}
              />
            </MilkdownProvider>
          </EditorErrorBoundary>
        )}
      </div>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg dark:bg-zinc-950 text-neutral text-[15px]">
          {t('editor.loadingDocument')}
        </div>
      )}
      {!isLoading && !isConnected && (
        <div
          role="status"
          className="absolute top-2 right-2 px-2 py-1 bg-warning/10 text-warning text-[13px]"
        >
          {t('editor.reconnecting')}
        </div>
      )}
      {!isLoading && readOnly && (
        <div className="absolute top-0 left-0 right-0 z-10 px-4 py-1.5 bg-surface/90 dark:bg-zinc-900/90 border-b border-border dark:border-zinc-800 text-center text-[13px] text-text-secondary dark:text-zinc-400 backdrop-blur">
          {t('editor.readOnly')}
        </div>
      )}
    </div>
  );
}
