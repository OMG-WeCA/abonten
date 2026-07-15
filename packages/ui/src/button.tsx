import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

// Minimal starter Button shared across web apps. Mobile uses its own primitives.
export function Button({ variant = 'primary', className, ...rest }: ButtonProps) {
  const base =
    variant === 'primary'
      ? 'bg-blue-600 text-white'
      : 'bg-gray-100 text-gray-900';
  return <button className={`rounded-md px-4 py-2 text-sm font-medium ${base} ${className ?? ''}`} {...rest} />;
}
