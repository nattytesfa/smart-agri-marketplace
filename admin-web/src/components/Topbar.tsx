'use client';

import { ReactNode } from 'react';
import Icon from './Icon';

interface TopbarProps {
  title: string;
  subtitle?: string;
  onOpenNav?: () => void;
  children?: ReactNode;
}

export default function Topbar({ title, subtitle, onOpenNav, children }: TopbarProps) {
  return (
    <header className="topbar">
      {onOpenNav ? (
        <button
          type="button"
          className="btn btn--ghost btn--icon topbar__menu-toggle"
          onClick={onOpenNav}
          aria-label="Open navigation"
        >
          <Icon name="menu" size={19} />
        </button>
      ) : null}

      <div className="topbar__titles">
        <span className="topbar__title">{title}</span>
        {subtitle ? <span className="topbar__subtitle">{subtitle}</span> : null}
      </div>

      <div className="topbar__actions">{children}</div>
    </header>
  );
}
