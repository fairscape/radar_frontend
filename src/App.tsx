import { useCallback, useEffect, useRef, useState } from 'react';
import { Sidebar, type ViewKey } from './components/Sidebar';
import { SidebarSoft } from './components/soft/SidebarSoft';
import { RadarView } from './views/RadarView';
import { ProfilesView } from './views/ProfilesView';
import { VaultView } from './views/VaultView';
import { RadarViewSoft } from './views/soft/RadarViewSoft';
import { ProfilesViewSoft } from './views/soft/ProfilesViewSoft';
import { VaultViewSoft } from './views/soft/VaultViewSoft';
import { ProfileWizard } from './views/ProfileWizard';
import { ResearchersView } from './views/ResearchersView';
import { ResearchersViewSoft } from './views/soft/ResearchersViewSoft';
import { LeaveDraftDialog } from './components/LeaveDraftDialog';
import { clearDraft, parkDraft, peekDraft } from './api/hooks/useDraft';
import { deleteDraft } from './api/endpoints/wizard';
import { Settings } from './views/Settings';
import { AuthGuard } from './components/AuthGuard';
import { Splash } from './views/Splash';

type Accent = 'amber' | 'cyan' | 'green' | 'magenta';
type Density = 'compact' | 'comfortable';
type AbstractDefault = 'collapsed' | 'open';
type Theme = 'dark' | 'light';
type Mode = 'dense' | 'approachable';

interface Tweaks {
  accent: Accent;
  density: Density;
  abstractDefault: AbstractDefault;
  theme: Theme;
  mode: Mode;
}

const TWEAK_DEFAULTS: Tweaks = {
  density: 'comfortable',
  accent: 'amber',
  abstractDefault: 'collapsed',
  theme: 'dark',
  mode: 'dense',
};

const ACCENT_MAP: Record<Accent, string> = {
  amber: 'oklch(0.78 0.15 75)',
  cyan: 'oklch(0.78 0.12 210)',
  green: 'oklch(0.78 0.14 150)',
  magenta: 'oklch(0.72 0.18 340)',
};

function isViewKey(v: string | null): v is ViewKey {
  return (
    v === 'radar' ||
    v === 'vault' ||
    v === 'profiles' ||
    v === 'researchers' ||
    v === 'profile-wizard' ||
    v === 'settings'
  );
}

function viewFromPath(path: string): ViewKey | null {
  if (path === '/profiles/new') return 'profile-wizard';
  if (path === '/profiles') return 'profiles';
  if (path === '/researchers') return 'researchers';
  if (path === '/vault') return 'vault';
  if (path === '/radar') return 'radar';
  if (path === '/settings') return 'settings';
  return null;
}

function isSplashPath(path: string): boolean {
  return path === '/' || path === '/splash';
}

function pathForView(view: ViewKey): string {
  switch (view) {
    case 'profile-wizard':
      return '/profiles/new';
    case 'profiles':
      return '/profiles';
    case 'researchers':
      return '/researchers';
    case 'vault':
      return '/vault';
    case 'radar':
      return '/radar';
    case 'settings':
      return '/settings';
  }
}

export function App() {
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return isSplashPath(window.location.pathname);
  });
  const [view, setView] = useState<ViewKey>(() => {
    const fromPath = typeof window !== 'undefined'
      ? viewFromPath(window.location.pathname)
      : null;
    if (fromPath) return fromPath;
    const saved = localStorage.getItem('radar_view');
    return isViewKey(saved) ? saved : 'radar';
  });
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [tweaks, setTweaks] = useState<Tweaks>(() => {
    const savedTheme = localStorage.getItem('radar_theme');
    const theme: Theme = savedTheme === 'light' ? 'light' : 'dark';
    const savedMode = localStorage.getItem('radar_mode');
    const mode: Mode = savedMode === 'approachable' ? 'approachable' : 'dense';
    return { ...TWEAK_DEFAULTS, theme, mode };
  });
  const [tweaksOpen, setTweaksOpen] = useState(false);
  // Where the user wanted to go when the leave-draft dialog opened.
  const [pendingView, setPendingView] = useState<ViewKey | null>(null);
  const viewRef = useRef<ViewKey>(view);
  viewRef.current = view;

  /** Route every view change through the wizard's leave guard: an
   *  unfinished draft gets a keep / discard / stay dialog instead of
   *  being silently left behind (or silently resumed next time). */
  const navigate = useCallback((target: ViewKey) => {
    const leavingWizard = viewRef.current === 'profile-wizard' && target !== 'profile-wizard';
    if (leavingWizard && peekDraft()) {
      setPendingView(target);
      return;
    }
    setView(target);
  }, []);

  const resolveLeave = (keep: boolean) => {
    const target = pendingView;
    setPendingView(null);
    if (!target) return;
    const draft = peekDraft();
    if (keep) {
      parkDraft();
    } else if (draft?.slug) {
      deleteDraft(draft.slug).catch(() => {
        /* already gone or committed — nothing to clean up */
      });
      clearDraft();
    }
    setView(target);
  };

  useEffect(() => {
    if (showSplash) return;
    localStorage.setItem('radar_view', view);
    const wantPath = pathForView(view);
    if (window.location.pathname !== wantPath) {
      window.history.replaceState({}, '', wantPath);
    }
  }, [view, showSplash]);

  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname;
      if (isSplashPath(path)) {
        setShowSplash(true);
        return;
      }
      setShowSplash(false);
      const v = viewFromPath(path);
      if (!v) return;
      if (viewRef.current === 'profile-wizard' && v !== 'profile-wizard' && peekDraft()) {
        // Put the wizard URL back and ask; resolveLeave() moves on.
        window.history.pushState({}, '', pathForView('profile-wizard'));
        setPendingView(v);
        return;
      }
      setView(v);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = tweaks.theme;
    localStorage.setItem('radar_theme', tweaks.theme);
  }, [tweaks.theme]);

  useEffect(() => {
    localStorage.setItem('radar_mode', tweaks.mode);
  }, [tweaks.mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (showSplash) {
        if (e.key === '`') setTweaksOpen((o) => !o);
        return;
      }
      if (e.key === 'r' || e.key === 'R') navigate('radar');
      if (e.key === 'v' || e.key === 'V') navigate('vault');
      if (e.key === 'p' || e.key === 'P') navigate('profiles');
      if (e.key === '`') setTweaksOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showSplash, navigate]);

  useEffect(() => {
    document.documentElement.style.setProperty('--acc-high', ACCENT_MAP[tweaks.accent]);
  }, [tweaks.accent]);

  const updateTweak = <K extends keyof Tweaks>(k: K, v: Tweaks[K]) => {
    setTweaks((prev) => ({ ...prev, [k]: v }));
  };

  const isSoft = tweaks.mode === 'approachable';
  const optsClass = isSoft ? 'tweaks-opts' : 'opts';

  const openFromSplash = (target: ViewKey, mode: Mode) => {
    updateTweak('mode', mode);
    setShowSplash(false);
    setView(target);
    const wantPath = pathForView(target);
    if (window.location.pathname !== wantPath) {
      window.history.pushState({}, '', wantPath);
    }
  };

  const goHome = () => {
    setShowSplash(true);
    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
    }
  };

  if (showSplash) {
    return <Splash onOpen={openFromSplash} />;
  }

  return (
    <AuthGuard>
    <div className={isSoft ? 'soft-app' : 'app'}>
      {isSoft ? (
        <SidebarSoft view={view} setView={navigate} onHome={goHome} />
      ) : (
        <Sidebar view={view} setView={navigate} onHome={goHome} />
      )}
      <div className="main">
        {view === 'profile-wizard' ? (
          <ProfileWizard
            onDone={(slug) => {
              setSelectedProfile(slug);
              setView('profiles');
            }}
            onCancel={() => navigate('profiles')}
          />
        ) : view === 'settings' ? (
          <Settings onSignOut={() => navigate('radar')} />
        ) : isSoft ? (
          <>
            {view === 'radar' && <RadarViewSoft onNewProfile={() => navigate('profile-wizard')} />}
            {view === 'profiles' && (
              <ProfilesViewSoft
                selected={selectedProfile}
                setSelected={setSelectedProfile}
                onNew={() => navigate('profile-wizard')}
              />
            )}
            {view === 'vault' && <VaultViewSoft />}
            {view === 'researchers' && <ResearchersViewSoft />}
          </>
        ) : (
          <>
            {view === 'radar' && <RadarView />}
            {view === 'profiles' && (
              <ProfilesView
                selected={selectedProfile}
                setSelected={setSelectedProfile}
                onNew={() => navigate('profile-wizard')}
              />
            )}
            {view === 'vault' && <VaultView />}
            {view === 'researchers' && <ResearchersView />}
          </>
        )}
      </div>
      {pendingView && (
        <LeaveDraftDialog
          name={peekDraft()?.name ?? ''}
          step={peekDraft()?.step ?? 1}
          onKeep={() => resolveLeave(true)}
          onDiscard={() => resolveLeave(false)}
          onStay={() => setPendingView(null)}
        />
      )}
      {tweaksOpen && (
        <div className="tweaks">
          <div className="tweaks-head">
            <span>{isSoft ? 'Tweaks' : 'TWEAKS'}</span>
            <span
              onClick={() => setTweaksOpen(false)}
              style={{ cursor: 'pointer', color: 'var(--fg-4)' }}
            >
              ×
            </span>
          </div>
          <div className="tweaks-body">
            <div className="tweaks-row">
              <span>Mode</span>
              <div className={optsClass}>
                {(['dense', 'approachable'] as Mode[]).map((o) => (
                  <button
                    key={o}
                    className={tweaks.mode === o ? 'on' : ''}
                    onClick={() => updateTweak('mode', o)}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
            <div className="tweaks-row">
              <span>Theme</span>
              <div className={optsClass}>
                {(['dark', 'light'] as Theme[]).map((o) => (
                  <button
                    key={o}
                    className={tweaks.theme === o ? 'on' : ''}
                    onClick={() => updateTweak('theme', o)}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
            <div className="tweaks-row">
              <span>Accent</span>
              <div className={optsClass}>
                {(['amber', 'cyan', 'green', 'magenta'] as Accent[]).map((o) => (
                  <button
                    key={o}
                    className={tweaks.accent === o ? 'on' : ''}
                    onClick={() => updateTweak('accent', o)}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
            {!isSoft && (
              <>
                <div className="tweaks-row">
                  <span>Density</span>
                  <div className={optsClass}>
                    {(['compact', 'comfortable'] as Density[]).map((o) => (
                      <button
                        key={o}
                        className={tweaks.density === o ? 'on' : ''}
                        onClick={() => updateTweak('density', o)}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="tweaks-row">
                  <span>Abstract</span>
                  <div className={optsClass}>
                    {(['collapsed', 'open'] as AbstractDefault[]).map((o) => (
                      <button
                        key={o}
                        className={tweaks.abstractDefault === o ? 'on' : ''}
                        onClick={() => updateTweak('abstractDefault', o)}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {!tweaksOpen && (
        <div
          onClick={() => setTweaksOpen(true)}
          style={{
            position: 'fixed',
            right: 12,
            bottom: 12,
            padding: '4px 8px',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--fg-4)',
            border: '1px solid var(--line-2)',
            background: 'var(--bg-1)',
            cursor: 'pointer',
            letterSpacing: '0.12em',
            zIndex: 99,
          }}
        >
          TWEAKS · `
        </div>
      )}
    </div>
    </AuthGuard>
  );
}
