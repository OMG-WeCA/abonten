import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Container } from './Container';

type Variant = 'navy' | 'surface' | 'surface-2' | 'primary' | 'transparent';
type Size = 'sm' | 'md' | 'lg';

const bg: Record<Variant, string> = {
  navy: 'bg-background',
  surface: 'bg-surface',
  'surface-2': 'bg-surface-2',
  primary: 'bg-primary text-white',
  transparent: '',
};

const pad: Record<Size, string> = {
  sm: 'py-14',
  md: 'py-20',
  lg: 'py-24',
};

interface SectionProps extends ComponentPropsWithoutRef<'section'> {
  variant?: Variant;
  size?: Size;
  bleed?: boolean;
  children: ReactNode;
}

export function Section({
  variant = 'navy',
  size = 'lg',
  bleed = false,
  className = '',
  children,
  ...rest
}: SectionProps) {
  return (
    <section className={`${bg[variant]} ${pad[size]} ${className}`} {...rest}>
      {bleed ? children : <Container>{children}</Container>}
    </section>
  );
}