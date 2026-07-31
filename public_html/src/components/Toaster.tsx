'use client';

import { Toaster as HotToaster } from 'react-hot-toast';

/**
 * Global toast notification wrapper.
 *
 * Mounted once in the root layout. Pages should call:
 *   import toast from 'react-hot-toast';
 *   toast.success(t('common.savedSuccessfully'));
 *   toast.error(err.message || t('common.failedToSave'));
 *
 * The backend already returns translated error messages via the `?lang=` query
 * param set in `lib/api.ts`, so `err.message` is already localized. Success
 * messages are rendered in the frontend, so we wrap them in `t()` here.
 */
export default function Toaster() {
  return (
    <HotToaster
      position="top-right"
      gutter={12}
      toastOptions={{
        // Default duration: success = 4s, error = 6s (react-hot-toast defaults).
        duration: 4000,
        // Shared styling — reads from the project's design tokens / theme.
        className:
          '!rounded-xl !shadow-xl !text-sm !font-medium !p-4 !border',
        style: {
          // Background / text colour come from the `success` / `error` overrides below
          // but we set sensible fallbacks here. react-hot-toast is theme-agnostic
          // by default — the `className` above uses Tailwind utilities which the
          // project already supports in dark mode via `data-theme="dark"`.
          background: 'var(--toast-bg, #ffffff)',
          color: 'var(--toast-fg, #1f2937)',
          borderColor: 'var(--toast-border, #e5e7eb)',
        },
        success: {
          duration: 3000,
          iconTheme: { primary: '#10b981', secondary: '#ffffff' },
          style: {
            background: 'var(--toast-success-bg, #ecfdf5)',
            color: 'var(--toast-success-fg, #065f46)',
            borderColor: 'var(--toast-success-border, #a7f3d0)',
          },
        },
        error: {
          duration: 6000,
          iconTheme: { primary: '#ef4444', secondary: '#ffffff' },
          style: {
            background: 'var(--toast-error-bg, #fef2f2)',
            color: 'var(--toast-error-fg, #991b1b)',
            borderColor: 'var(--toast-error-border, #fecaca)',
          },
        },
        loading: {
          iconTheme: { primary: '#6366f1', secondary: '#ffffff' },
        },
      }}
    />
  );
}
