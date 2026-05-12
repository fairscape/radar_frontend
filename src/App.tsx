import { useEffect, useState } from 'react';
import { Sidebar, type ViewKey } from './components/Sidebar';
import { SidebarSoft } from './components/soft/SidebarSoft';
import { RadarView } from './views/RadarView';
import { ProfilesView } from './views/ProfilesView';
import { VaultView } from './views/VaultView';
import { RadarViewSoft } from './views/soft/RadarViewSoft';
import { ProfilesViewSoft } from './views/soft/ProfilesViewSoft';
import { VaultViewSoft } from './views/soft/VaultViewSoft';
import { ProfileWizard } from './views/ProfileWizard';
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
    v === 'profile-wizard' ||
    v === 'settings'
  );
}

function viewFromPath(path: string): ViewKey | null {
  if (path === '/profiles/new') return 'profile-wizard';
  if (path === '/profiles') return 'profiles';
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
      if (v) setView(v);
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
      if (e.key === 'r' || e.key === 'R') setView('radar');
      if (e.key === 'v' || e.key === 'V') setView('vault');
      if (e.key === 'p' || e.key === 'P') setView('profiles');
      if (e.key === '`') setTweaksOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showSplash]);

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
        <SidebarSoft view={view} setView={setView} onHome={goHome} />
      ) : (
        <Sidebar view={view} setView={setView} onHome={goHome} />
      )}
      <div className="main">
        {view === 'profile-wizard' ? (
          <ProfileWizard
            onDone={(slug) => {
              setSelectedProfile(slug);
              setView('profiles');
            }}
            onCancel={() => setView('profiles')}
          />
        ) : view === 'settings' ? (
          <Settings onSignOut={() => setView('radar')} />
        ) : isSoft ? (
          <>
            {view === 'radar' && <RadarViewSoft onNewProfile={() => setView('profile-wizard')} />}
            {view === 'profiles' && (
              <ProfilesViewSoft
                selected={selectedProfile}
                setSelected={setSelectedProfile}
                onNew={() => setView('profile-wizard')}
              />
            )}
            {view === 'vault' && <VaultViewSoft />}
          </>
        ) : (
          <>
            {view === 'radar' && <RadarView />}
            {view === 'profiles' && (
              <ProfilesView
                selected={selectedProfile}
                setSelected={setSelectedProfile}
                onNew={() => setView('profile-wizard')}
              />
            )}
            {view === 'vault' && <VaultView />}
          </>
        )}
      </div>
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
