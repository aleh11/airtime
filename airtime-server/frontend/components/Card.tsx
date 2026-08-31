import React from 'react';
import { Card as UICard, CardContent, CardHeader, CardTitle } from './ui/card';
import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', title, action }) => {
  return (
    <UICard className={cn('gap-0 rounded-xl py-6 shadow-sm', className)}>
      {(title || action) && (
        <CardHeader className="mb-4 px-6 [.border-b]:pb-0">
          {title && <CardTitle className="text-lg font-semibold text-card-foreground">{title}</CardTitle>}
          {action && <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">{action}</div>}
        </CardHeader>
      )}
      <CardContent className="flex-1 px-6">{children}</CardContent>
    </UICard>
  );
};
