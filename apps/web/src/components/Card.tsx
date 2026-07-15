import type { HTMLAttributes } from 'react';

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface p-6 shadow-sm transition-shadow hover:shadow-md ${className}`}
      {...rest}
    />
  );
}
