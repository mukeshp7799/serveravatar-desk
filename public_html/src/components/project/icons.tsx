/**
 * Map from string icon names → lucide-react components.
 *
 * Project-hub pages receive `iconName` strings in props (so they can be
 * rendered from mock data without dragging React components through
 * serialization). This module is the single resolver.
 */

import {
  Activity,
  ClipboardCheck,
  BarChart3,
  Calendar,
  CalendarPlus,
  FileText,
  Folder,
  Hash,
  Home,
  KanbanSquare,
  LayoutGrid,
  ListChecks,
  MessageSquare,
  Plus,
  Settings,
  Upload,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  Activity,
  BarChart3,
  Calendar,
  CalendarPlus,
  FileText,
  Folder,
  Hash,
  Home,
  KanbanSquare,
  LayoutGrid,
  ListChecks,
  MessageSquare,
  Plus,
  Settings,
  Upload,
  UserPlus,
  Users,
  ClipboardCheck,
}

export function resolveIcon(name: string, size = 18, strokeWidth = 2.25): React.ReactNode {
  const C = ICONS[name]
  if (!C) return null
  return <C size={size} strokeWidth={strokeWidth} />
}
