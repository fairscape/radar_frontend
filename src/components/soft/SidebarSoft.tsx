import { useEffect, useState } from 'react';
import { IconSoft, type IconName } from './IconSoft';
import {
  listProfiles,
  swatchFor,
  useDailyRadar,
  useVault,
} from '../../lib/apiSwitch';
import { getUserEmail, subscribeUserEmail } from '../../lib/userEmail';
import type { Profile } from '../../types/radar';
import type { ViewKey } from '../Sidebar';

const NAV: { key: ViewKey; label: string; icon: IconName }[] = [
  { key: 'radar', label: 'Daily Radar', icon: 'radar' },
  { key: 'vault', label: 'Vault', icon: 'vault' },
  { key: 'profiles', label: 'Profiles', icon: 'profiles' },
];

export function SidebarSoft({
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
        <div className="sb-logo">R</div>
        <div className="sb-name">Radar</div>
      </div>
      <nav className="sb-nav">
        {NAV.map((n) => (
          <div
            key={n.key}
            className={`sb-item ${view === n.key ? 'active' : ''}`}
            onClick={() => setView(n.key)}
          >
            <span className="ico"><IconSoft name={n.icon} /></span>
            <span>{n.label}</span>
            <span className="count">{counts[n.key] ?? '—'}</span>
          </div>
        ))}
      </nav>
      <div className="sb-section">
        <div className="sb-section-label">Your profiles</div>
        {profiles.map((p) => (
          <div key={p.key} className="sb-prof">
            <span className="dot" style={{ background: swatchFor(p.hue) }} />
            <span className="nm">{p.name}</span>
            <span className="ct">{p.saves30}</span>
          </div>
        ))}
      </div>
      <div className="sb-foot">
        <div
          className={`row ${view === 'settings' ? 'active' : ''}`}
          onClick={() => setView('settings')}
          style={{
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
          }}
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
