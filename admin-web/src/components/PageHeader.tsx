import { ReactNode } from 'react';
import Icon, { type IconName } from './Icon';

interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  eyebrowIcon?: IconName;
  actions?: ReactNode;
}

export default function PageHeader({
  title,
  description,
  eyebrow,
  eyebrowIcon,
  actions,
}: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        {eyebrow ? (
          <p className="page-header__eyebrow">
            {eyebrowIcon ? <Icon name={eyebrowIcon} size={13} /> : null}
            {eyebrow}
          </p>
        ) : null}
        <h1 className="page-header__title">{title}</h1>
        {description ? <p className="page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </div>
  );
}
