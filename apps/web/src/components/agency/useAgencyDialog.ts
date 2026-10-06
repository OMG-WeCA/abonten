'use client';

import { useEffect, useRef } from 'react';

/** Keep the opener through StrictMode replay and release modal focus before restoring it. */
export function useAgencyDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const active = document.activeElement;
    if (!opener.current && active instanceof HTMLElement && !element.contains(active)) {
      opener.current = active;
    }
    if (!element.open) element.showModal();
    return () => {
      if (element.open) element.close();
      if (opener.current?.isConnected) opener.current.focus();
    };
  }, []);
  return dialog;
}
