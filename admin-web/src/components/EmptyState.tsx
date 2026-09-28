import type { ReactNode } from 'react';
import Icon, { type IconName } from './Icon';

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  message?: string;
  action?: ReactNode;
}

export default function EmptyState({
  icon = 'inbox',
  title,
  message,
  action,
}: EmptyStateProps) {
  return (
    <div className="empty">
      <span className="empty__icon">
        <Icon name={icon} size={24} />
      </span>
      <p className="empty__title">{title}</p>
      {message ? <p className="empty__message">{message}</p> : null}
      {action}
    </div>
  );
}
