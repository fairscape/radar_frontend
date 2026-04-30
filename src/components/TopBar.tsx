import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { getUserEmail, subscribeUserEmail } from '../lib/userEmail';

export function TopBar({ crumbs, right }: { crumbs: string[]; right?: ReactNode }) {
  const [email, setEmail] = useState<string | null>(() => getUserEmail());
  useEffect(() => subscribeUserEmail(() => setEmail(getUserEmail())), []);

  return (
    <div className="top">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="sep">/</span>}
            <span className={i === crumbs.length - 1 ? 'cur' : ''}>{c}</span>
          </Fragment>
        ))}
      </div>
      <div className="top-filters" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {right}
        {email && (
          <span
            className="mono"
            style={{ fontSize: 10, color: 'var(--fg-4)', letterSpacing: '0.08em' }}
            title={email}
          >
            {email}
          </span>
        )}
      </div>
    </div>
  );
}
