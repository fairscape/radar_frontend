import { useEffect, useState } from 'react';
import { Glyph, type GlyphName } from './Glyph';
import {
  listProfiles,
  swatchFor,
  useDailyRadar,
  useVault,
} from '../lib/apiSwitch';
import { getUserEmail, subscribeUserEmail } from '../lib/userEmail';
import type { Profile } from '../types/radar';

export type ViewKey =
  | 'radar'
  | 'vault'
  | 'profiles'
  | 'profile-wizard'
  | 'settings';

const NAV: { key: ViewKey; label: string; glyph: GlyphName }[] = [
  { key: 'radar', label: 'Daily Radar', glyph: 'radar' },
  { key: 'vault', label: 'Vault', glyph: 'vault' },
  { key: 'profiles', label: 'Profiles', glyph: 'profiles' },
];

export function Sidebar({
  view,
  setView,
}: {
  view: ViewKey;
  setView: (v: ViewKey) => void;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [email, setEmail] = useState<string | null>(() => getUserEmail());
  const { data: radarData } = useDailyRadar({});
  const { stats: vaultStats } = useVault('');

  useEffect(() => {
    let cancelled = false;
    listProfiles().then((p) => { if (!cancelled) setProfiles(p); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => subscribeUserEmail(() => setEmail(getUserEmail())), []);

  const counts: Record<ViewKey, number | null> = {
    radar: radarData ? radarData.cards.length : null,
    vault: vaultStats ? vaultStats.docs : null,
    profiles: profiles.length,
    'profile-wizard': null,
    settings: null,
  };

  return (
    <aside className="sb">
      <div className="sb-brand">
        <div className="sb-mark" />
        <div className="sb-title">Radar</div>
        <div className="sb-ver">v0.9.3</div>
      </div>
      <nav className="sb-nav">
        <div className="sb-group-label">Workspace</div>
        {NAV.map((n) => (
          <div
            key={n.key}
            className={`sb-item ${view === n.key ? 'active' : ''}`}
            onClick={() => setView(n.key)}
          >
            <Glyph name={n.glyph} size={13} />
            <span>{n.label}</span>
            <span className="count mono">{counts[n.key] ?? '—'}</span>
          </div>
        ))}
        <div className="sb-group-label" style={{ marginTop: 14 }}>Profiles</div>
        <div className="sb-section" style={{ borderTop: 0, padding: '2px 10px 0' }}>
          <div
            className={`sb-profile ${view === 'profile-wizard' ? 'active' : ''}`}
            onClick={() => setView('profile-wizard')}
            style={{ cursor: 'pointer', color: 'var(--acc-high)' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)' }}>+</span>
              <span>New profile</span>
            </span>
          </div>
          {profiles.map((p) => (
            <div className="sb-profile" key={p.key}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                <span style={{ width: 7, height: 7, background: swatchFor(p.hue), flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              </span>
              <span className="n">{p.saves30 + p.dismisses30}</span>
            </div>
          ))}
        </div>
      </nav>
      <div className="sb-foot">
        <div
          className={`row ${view === 'settings' ? 'active' : ''}`}
          onClick={() => setView('settings')}
          style={{ cursor: 'pointer' }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {email ?? 'signed out'}
          </span>
          <span style={{ color: 'var(--fg-4)' }}>SETTINGS</span>
        </div>
      </div>
    </aside>
  );
}
