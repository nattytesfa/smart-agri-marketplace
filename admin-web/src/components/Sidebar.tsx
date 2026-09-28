'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon, { type IconName } from './Icon';
import { initials } from '../lib/format';

interface NavItem {
  name: string;
  href: string;
  icon: IconName;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ name: 'Dashboard', href: '/dashboard', icon: 'dashboard' }],
  },
  {
    label: 'Operations',
    items: [
      { name: 'User Verification', href: '/users', icon: 'shield-check' },
      { name: 'Escrow Management', href: '/transactions', icon: 'wallet' },
      { name: 'Listings', href: '/listings', icon: 'package' },
      { name: 'Subscriptions', href: '/subscriptions', icon: 'card' },
      { name: 'Field Agents', href: '/agents', icon: 'user-group' },
    ],
  },
  {
    label: 'Insights',
    items: [{ name: 'Commodity Heatmap', href: '/analytics-heatmap', icon: 'trending-up' }],
  },
];

const SETTINGS_ITEM: NavItem = {
  name: 'Settings',
  href: '/settings',
  icon: 'settings',
};

interface SidebarProps {
  userEmail: string;
  onNavigate?: () => void;
  onSignOut: () => void;
}

export default function Sidebar({ userEmail, onNavigate, onSignOut }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="sidebar__brand">
        <span className="sidebar__mark">
          <Icon name="sprout" size={20} filled={false} strokeWidth={2} />
        </span>
        <div>
          <div className="sidebar__name">AgriDirect</div>
          <div className="sidebar__tagline">Admin Portal</div>
        </div>
      </div>

      <nav className="nav">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="nav__section">{group.label}</p>
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav__item${isActive(item.href) ? ' is-active' : ''}`}
                aria-current={isActive(item.href) ? 'page' : undefined}
                onClick={onNavigate}
              >
                <span className="nav__icon">
                  <Icon name={item.icon} size={18} />
                </span>
                <span className="nav__label">{item.name}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar__footer">
        <Link
          href={SETTINGS_ITEM.href}
          className={`nav__item${isActive(SETTINGS_ITEM.href) ? ' is-active' : ''}`}
          aria-current={isActive(SETTINGS_ITEM.href) ? 'page' : undefined}
          onClick={onNavigate}
        >
          <span className="nav__icon">
            <Icon name={SETTINGS_ITEM.icon} size={18} />
          </span>
          <span className="nav__label">{SETTINGS_ITEM.name}</span>
        </Link>

        <div className="sidebar__user" style={{ marginTop: 'var(--space-2)' }}>
          <span className="sidebar__avatar" aria-hidden="true">
            {initials(userEmail)}
          </span>
          <span className="sidebar__user-text">
            <span className="sidebar__user-name" title={userEmail}>
              {userEmail}
            </span>
            <span className="sidebar__user-role">Administrator</span>
          </span>
          <button
            type="button"
            className="input-group__action"
            onClick={onSignOut}
            aria-label="Sign out"
            title="Sign out"
            style={{ color: 'rgba(236,254,245,0.6)' }}
          >
            <Icon name="logout" size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
