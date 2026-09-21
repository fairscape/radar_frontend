import { paths } from '../lib/router';
import { EmptyState } from '../ui';
import { Link } from '../ui/Link';

export function NotFoundPage({ path }: { path: string }) {
  return (
    <div className="page">
      <EmptyState
        icon="alert"
        title="There is nothing here"
        body={<>No page matches <code>{path}</code>.</>}
        action={<Link href={paths.feed} className="btn btn-primary">Go to the feed</Link>}
      />
    </div>
  );
}
