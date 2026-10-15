import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      action={
        <Link to="/">
          <Button variant="secondary">Back to dashboard</Button>
        </Link>
      }
    >
      That route doesn't exist.
    </EmptyState>
  );
}
