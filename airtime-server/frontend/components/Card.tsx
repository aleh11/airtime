import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', title, action }) => {
  return (
    <div className={`bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-sm ${className}`}>
      {(title || action) && (
        <div className="flex justify-between items-center mb-4">
            {title && <h3 className="text-slate-100 font-semibold text-lg">{title}</h3>}
            {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
};