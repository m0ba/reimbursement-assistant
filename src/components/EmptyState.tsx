import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="ico">{icon}</span>
      <div className="t">{title}</div>
      {hint && <div className="h">{hint}</div>}
      {action}
    </div>
  );
}
