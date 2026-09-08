import { z } from 'zod';
export { validateForm } from './forms';

/**
 * Zod schemas for client-side form validation across the app.
 *
 * Usage:
 *   import { validateForm, loginSchema, registerSchema, ... } from '@/lib/schemas';
 *
 *   const handleSubmit = async (e) => {
 *     e.preventDefault();
 *     const valid = validateForm(loginSchema, { email, password });
 *     if (!valid) return;
 *     // valid is the parsed (and type-narrowed) payload
 *     await api.post('/auth/login', valid);
 *   };
 *
 * validateForm() shows the first error via react-hot-toast and returns null
 * if validation fails. If it succeeds, it returns the parsed data with any
 * transforms applied (e.g. trimming strings, coercing numbers).
 */

// ─── Login ──────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ─── Strong password requirements ──────────────────────────────────────────
// Password must contain: 8+ chars, 1 uppercase, 1 lowercase, 1 number, 1 special character (@#$&!*^~)
export const passwordRequirements = {
  minLength: 8,
  pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/,
};

export function passwordValidation(password: string) {
  const errors: string[] = [];
  if (password.length < passwordRequirements.minLength) {
    errors.push(`At least ${passwordRequirements.minLength} characters`);
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('At least 1 uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('At least 1 lowercase letter');
  }
  if (!/\d/.test(password)) {
    errors.push('At least 1 number');
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};:'",.<>\/?]/.test(password)) {
    errors.push('At least 1 special character (@#$&!*^~)');
  }
  return errors;
}

export function isPasswordStrong(password: string): boolean {
  return passwordRequirements.pattern.test(password);
}

// ─── Register ───────────────────────────────────────────────────────────
export const registerSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required')
    .refine(p => isPasswordStrong(p), {
      message: 'Password must contain at least 8 characters, 1 uppercase, 1 lowercase, 1 number, and 1 special character (@#$&!*^~)',
    }),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  employeeId: z.string().optional(),
  departmentId: z.string().optional(),
  designation: z.string().max(100, 'Designation is too long (max 100 chars)').optional(),
  hireDate: z.string().optional(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});
export type RegisterInput = z.infer<typeof registerSchema>;

// ─── Project ────────────────────────────────────────────────────────────
export const projectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(100),
  description: z.string().max(1000).optional(),
});
export type ProjectInput = z.infer<typeof projectSchema>;

// ─── Discussion (create) ────────────────────────────────────────────────
export const discussionSchema = z.object({
  projectId: z.string().optional(),
  title: z.string().min(1, 'Title is required').max(200),
});
export type DiscussionInput = z.infer<typeof discussionSchema>;

// ─── Discussion message (send) ──────────────────────────────────────────
export const discussionMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(2000),
});
export type DiscussionMessageInput = z.infer<typeof discussionMessageSchema>;

// ─── Structure (department / designation) ───────────────────────────────
export const structureSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
});
export type StructureInput = z.infer<typeof structureSchema>;

// ─── Role ───────────────────────────────────────────────────────────────
export const roleSchema = z.object({
  name: z.string().min(1, 'Role name is required').max(50),
});
export type RoleInput = z.infer<typeof roleSchema>;

// ─── Leave apply ────────────────────────────────────────────────────────
export const leaveApplySchema = z.object({
  leaveTypeId: z.string().min(1, 'Please select a leave type'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  reason: z.string().max(500).optional(),
}).refine(
  d => new Date(d.startDate) <= new Date(d.endDate),
  { message: 'End date must be on or after start date', path: ['endDate'] }
);
export type LeaveApplyInput = z.infer<typeof leaveApplySchema>;

// ─── Leave type (admin: create / edit) ──────────────────────────────────
export const leaveTypeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50),
  accrual_rate: z.coerce.number().min(0, 'Must be ≥ 0').max(1000),
  max_allowed: z.coerce.number().min(0, 'Must be ≥ 0').max(365),
  is_paid: z.boolean(),
  carry_over_limit: z.coerce.number().min(0, 'Must be ≥ 0').max(365),
  description: z.string().max(500).optional(),
});
export type LeaveTypeInput = z.infer<typeof leaveTypeSchema>;

// ─── Profile (settings) ─────────────────────────────────────────────────
export const profileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  phone: z.string().max(30).optional(),
  address: z.string().max(300).optional(),
  personalEmail: z.string().email('Please enter a valid personal email').optional().or(z.literal('')),
  emergencyContactName: z.string().max(100).optional(),
  emergencyContactPhone: z.string().max(30).optional(),
  bio: z.string().max(1000).optional(),
  linkedin: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  twitter: z.string().max(100).optional(),
  github: z.string().max(100).optional(),
  website: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
});
export type ProfileInput = z.infer<typeof profileSchema>;

// ─── Password change ────────────────────────────────────────────────────
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(1, 'New password is required')
    .refine(p => isPasswordStrong(p), {
      message: 'Password must contain at least 8 characters, 1 uppercase, 1 lowercase, 1 number, and 1 special character (@#$&!*^~)',
    }),
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;

// ─── Announcement ───────────────────────────────────────────────────────
export const announcementSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  content: z.string().min(1, 'Content is required').max(5000),
});
export type AnnouncementInput = z.infer<typeof announcementSchema>;

export const announcementFormSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  content: z.string().min(1, 'Content is required').max(5000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  status: z.enum(['draft', 'published', 'archived']),
  audience_target: z.enum(['everyone', 'departments', 'roles', 'employees']),
  target_ids: z.array(z.number()).optional(),
  publish_date: z.string().optional().or(z.literal('')),
  expiry_date: z.string().optional().or(z.literal('')),
  is_pinned: z.boolean().optional(),
});
export type AnnouncementFormData = z.infer<typeof announcementFormSchema>;

// ─── Task (create / edit) ───────────────────────────────────────────────
export const taskSchema = z.object({
  projectId: z.string().min(1, 'Please select a project'),
  listId: z.string().min(1, 'Please select a todo list'),
  description: z.string().min(1, 'Description is required').max(500),
  assignedToUserId: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.enum(['todo', 'in_progress', 'review', 'done']).optional(),
});
export type TaskInput = z.infer<typeof taskSchema>;

// ─── Employee (admin: create / edit) ────────────────────────────────────
// Password is only required when creating a new employee, so we handle it
// with a refine() and a flag rather than making it optional.
export const employeeSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  email: z.string().min(1, 'Email is required').email('Please enter a valid email'),
  password: z.string().optional(),
  employeeId: z.string().max(50).optional(),
  departmentId: z.string().optional(),
  designation: z.string().max(100, 'Designation is too long (max 100 chars)').optional(),
  managerId: z.string().optional(),
  roleId: z.string().optional(),
  hireDate: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});
export type EmployeeInput = z.infer<typeof employeeSchema>;

/**
 * Helper for employee create: password must be ≥ 6 chars when provided.
 * Use validateEmployeeCreate() instead of plain validateForm().
 */
export const employeeCreateSchema = employeeSchema.refine(
  d => !!d.password && d.password.length >= 6,
  { message: 'Password is required (min 6 characters)', path: ['password'] }
);
export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;

// ─── Document (project document — rich text) ───────────────────────────
// Note: content_html is required at the form level but can be empty string
// when the user submits without typing — server treats it as a blank doc.
export const documentSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  content_html: z.string().max(500_000).optional(),
});
export type DocumentInput = z.infer<typeof documentSchema>;