import { z } from 'zod';
import toast from 'react-hot-toast';

/**
 * Validate form data with a Zod schema.
 *
 * On success: returns the parsed (and type-narrowed) payload.
 * On failure: shows the first error message via react-hot-toast and returns null.
 *
 * Example:
 *   const data = validateForm(loginSchema, { email, password });
 *   if (!data) return; // toast already shown
 *   await api.post('/auth/login', data);
 */
export function validateForm<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): z.infer<T> | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    toast.error(firstIssue?.message || 'Please check the form for errors');
    return null;
  }
  return result.data;
}

/**
 * Same as validateForm(), but collects ALL error messages into a single toast
 * (useful when you want the user to see everything that's wrong at once).
 */
export function validateFormAll<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): z.infer<T> | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    const messages = result.error.issues.map(i => i.message).filter(Boolean);
    const summary = messages.length > 3
      ? `${messages.slice(0, 3).join(' • ')} (+${messages.length - 3} more)`
      : messages.join(' • ');
    toast.error(summary || 'Please check the form for errors');
    return null;
  }
  return result.data;
}