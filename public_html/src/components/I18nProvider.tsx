'use client';

import { useEffect, useState } from 'react';
import '@/i18n/config';

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Give i18next a tick to initialize on the client
    setReady(true);
  }, []);

  // We render the children regardless. i18n is set up synchronously when the
  // module above is imported, and components using useTranslation will re-render
  // when the language changes.
  return <>{children}</>;
}
