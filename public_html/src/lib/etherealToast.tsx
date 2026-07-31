// Helper to show a toast that includes a "View on Ethereal" link when the
// backend response includes an `emailLog` payload.
//
// Usage:
//   import { showActionToast } from '@/lib/etherealToast'
//   const res = await api.post('/tasks', payload)
//   showActionToast(toast, t, res, t('tasks.createTask'))

import type { default as ToastFn } from 'react-hot-toast'

type AnyToast = typeof ToastFn

interface EmailLogPayload {
  ok?: boolean
  previewUrl?: string | null
  messageId?: string | null
  error?: string | null
}

interface ActionResponse {
  emailLog?: EmailLogPayload | null
  [key: string]: any
}

export function showActionToast(
  toast: AnyToast,
  t: (key: string) => string,
  res: ActionResponse | null | undefined,
  successMessage: string,
  errorMessage?: string
) {
  const log = res?.emailLog

  if (log && log.ok && log.previewUrl) {
    toast.success(
      (props) => (
        <div className="flex flex-col gap-1 max-w-[320px]">
          <div className="text-sm font-semibold">{successMessage}</div>
          <a
            href={log.previewUrl as string}
            target="_blank"
            rel="noreferrer"
            onClick={() => toast.dismiss(props.id)}
            className="text-xs text-indigo-600 hover:text-indigo-700 underline font-semibold"
          >
            {t('common.viewOnEthereal')} ↗
          </a>
        </div>
      ),
      { duration: 6000 }
    )
  } else if (log && log.ok === false) {
    // Email failed — show success for the action but a warning for the email
    toast.success(successMessage)
    toast.error(`Email failed: ${log.error || 'unknown error'}`, { duration: 8000 })
  } else {
    toast.success(successMessage)
  }
}
