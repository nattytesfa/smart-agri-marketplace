'use client';

import AppShell from '../../components/AppShell';
import PageHeader from '../../components/PageHeader';
import Icon, { type IconName } from '../../components/Icon';

interface PlannedCapability {
  icon: IconName;
  title: string;
  description: string;
}

const PLANNED: PlannedCapability[] = [
  {
    icon: 'user-group',
    title: 'Agent roster',
    description: 'Field agents, their regions and the farmer clusters each one covers.',
  },
  {
    icon: 'map-pin',
    title: 'Territory assignment',
    description: 'Geographic boundaries per agent, derived from the Debo clustering output.',
  },
  {
    icon: 'trending-up',
    title: 'Performance metrics',
    description: 'Listings created, verifications completed and adoption rate per agent.',
  },
  {
    icon: 'bell',
    title: 'Alert dispatch',
    description: 'Advisory and price notifications sent to farmers through an agent.',
  },
];

export default function AgentsPage() {
  return (
    <AppShell
      title="Field Agents"
      subtitle="Oversee field agent coverage and performance"
    >
      <PageHeader
        eyebrow="Operations"
        eyebrowIcon="user-group"
        title="Field agents"
        description="Agent management is the one admin module still waiting on its backend endpoints. The panel below documents exactly what will appear here once they land."
      />

      <div className="card">
        <div className="card__body">
          <div className="notice">
            <span className="notice__icon">
              <Icon name="user-group" size={26} />
            </span>
            <h2 className="notice__title">No agent data source yet</h2>
            <p className="notice__message">
              The backend does not currently expose an <code>/api/admin/agents</code>{' '}
              endpoint, so there is nothing real to display here. Rather than render
              placeholder figures that could be mistaken for live data, this page lists
              the capabilities that are planned.
            </p>

            <div className="notice__list">
              {PLANNED.map((capability) => (
                <div key={capability.title} className="notice__list-item">
                  <Icon
                    name={capability.icon}
                    size={16}
                    className="notice__list-icon"
                  />
                  <span>
                    <strong>{capability.title}</strong> — {capability.description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
