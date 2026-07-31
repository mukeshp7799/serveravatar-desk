'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '@/i18n/config';
import { Check } from 'lucide-react';

export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ||
    SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const change = (code: string) => {
    i18n.changeLanguage(code);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language: ${current.label}`}
        data-tooltip-id="app-tooltip"
        data-tooltip-content={`Language: ${current.label}`}
        className={`header-icon-btn text-xl ${open ? 'is-open' : ''}`}
      >
        <span aria-hidden className="leading-none">{current.flag}</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select language"
          className="absolute top-full right-0 mt-2 glass rounded-2xl shadow-2xl z-50 min-w-56 overflow-hidden animate-scale-in border border-white/60"
        >
          <div className="px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
            <div className="text-xs font-bold uppercase tracking-wider opacity-80">
              {current.code === 'en' ? 'Language' : <LangTitle i18n={i18n} />}
            </div>
            <div className="font-bold text-sm mt-0.5">{current.native}</div>
          </div>
          <div className="py-1 max-h-80 overflow-y-auto">
            {SUPPORTED_LANGUAGES.map((lang) => {
              const active = i18n.language?.startsWith(lang.code);
              return (
                <button
                  key={lang.code}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => change(lang.code)}
                  className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left cursor-pointer bg-transparent border-none transition ${
                    active
                      ? 'bg-indigo-50 text-indigo-700 font-semibold'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-xl">{lang.flag}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{lang.native}</span>
                    {lang.label !== lang.native && (
                      <span className="block text-[11px] text-gray-400 truncate">{lang.label}</span>
                    )}
                  </span>
                  {active && <Check size={14} strokeWidth={2.5} className="text-indigo-500" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function LangTitle({ i18n }: { i18n: any }) {
  // Simple inline lookup that doesn't depend on useTranslation
  const map: Record<string, string> = {
    en: 'Language',
    hi: 'भाषा',
    gu: 'ભાષા',
    mr: 'भाषा',
    ur: 'زبان',
    es: 'Idioma',
    zh: '语言',
  };
  const code = i18n.language?.split('-')[0] || 'en';
  return <>{map[code] || 'Language'}</>;
}
