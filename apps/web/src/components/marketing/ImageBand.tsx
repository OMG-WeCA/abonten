import type { ReactNode } from 'react';
import Image from 'next/image';
import { Reveal } from './Reveal';

interface ImageBandProps {
  src: string;
  alt: string;
  children: ReactNode;
  className?: string;
}

/**
 * Full-bleed photographic band with a dark gradient overlay for text readability.
 * Used to break up sections with a real WeCA cityscape / billboard image.
 */
export function ImageBand({ src, alt, children, className = '' }: ImageBandProps) {
  return (
    <section className={`relative overflow-hidden ${className}`}>
      <Image src={src} alt={alt} fill sizes="100vw" className="object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/85 via-background/70 to-background/95" />
      <Reveal variant="up" className="relative mx-auto max-w-4xl px-6 py-24 text-center sm:py-28">
        {children}
      </Reveal>
    </section>
  );
}