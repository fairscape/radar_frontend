import { paths } from '../lib/router';
import { useLease } from '../lib/writeLease';
import { EmptyState } from '../ui';
import { Link } from '../ui/Link';

/**
 * Instead of a page that only exists to change things (a new interest,
 * Edit interest) while another tab or device holds the account (W.A R2).
 * They open a draft or an edit copy as they load, so they are not shown
 * at all rather than shown with every control off.
 */
export function ViewOnlyPage({ what }: { what: string }) {
  return (
    <div className="page">
      <EmptyState
        icon="info"
        title={`${what} can't be opened in this tab`}
        body="This account is being changed in another tab or on another device; this tab can only view. Close or sign out of that one, and this page opens here (within 2 minutes if it was closed without signing out)."
        action={<Link href={paths.interests} className="btn btn-secondary">Go to Interests</Link>}
      />
    </div>
  );
}

/**
 * On New interest / Edit interest once this tab has lost the right to
 * change things (FC-2): the page stays, read-only, and says what happened
 * to the work on it. Nothing while the tab holds the right.
 */
export function LostRightNote() {
  const lease = useLease();
  if (lease !== 'viewing') return null;
  return (
    <div className="callout callout-warn view-only-banner" role="status" data-testid="lost-right">
      <div className="callout-body">
        <div className="callout-title">This page is read-only for now</div>
        <div className="callout-text">This tab lost the right to change things while the page was open (it went unheard for over 2 minutes: the computer slept or the connection dropped), so nothing here can be saved at the moment. What you entered stays on screen, and the draft or edit stays this page's. When this tab has the right again, carry on here.</div>
      </div>
    </div>
  );
}
