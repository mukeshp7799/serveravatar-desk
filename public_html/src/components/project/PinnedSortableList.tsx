'use client'

import { useEffect, useState } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Pin } from 'lucide-react'
import MessageItem from './MessageItem'
import type { ProjectMessage } from '@/types/project'

interface PinnedSortableListProps {
  messages: ProjectMessage[]
  onReorder: (ids: (string | number)[]) => Promise<boolean>
  onUpdate: (id: ProjectMessage['id'], payload: { title?: string | null; body_html: string; category?: ProjectMessage['category'] }) => Promise<ProjectMessage | null>
  onDelete: (id: ProjectMessage['id']) => Promise<boolean>
  onTogglePin: (id: ProjectMessage['id']) => Promise<ProjectMessage | null>
  onToggleReaction: (id: ProjectMessage['id'], emoji: string) => Promise<void>
  canMutate: boolean
  /** Current user's display name (used to label "You" in reaction tooltips). */
  currentUserName: string
}

/**
 * A vertical list of pinned messages that supports drag-and-drop reorder.
 * Uses `@dnd-kit/sortable` (already installed). Calls `onReorder` on drop.
 */
export default function PinnedSortableList({
  messages, onReorder, onUpdate, onDelete, onTogglePin, onToggleReaction, canMutate, currentUserName,
}: PinnedSortableListProps) {
  const [items, setItems] = useState<ProjectMessage[]>(messages)

  // Sync with parent when messages list changes externally (e.g. after a pin/unpin).
  useEffect(() => { setItems(messages) }, [messages])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 12 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = items.findIndex((i) => String(i.id) === String(active.id))
    const newIdx = items.findIndex((i) => String(i.id) === String(over.id))
    if (oldIdx === -1 || newIdx === -1) return
    const next = arrayMove(items, oldIdx, newIdx)
    setItems(next) // optimistic
    try {
      await onReorder(next.map((m) => m.id))
    } catch {
      // revert on failure
      setItems(items)
    }
  }

  if (items.length === 0) return null

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          <Pin size={10} strokeWidth={2.75} />
          Pinned
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">drag to reorder</span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((m) => String(m.id))} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {items.map((m) => (
              <SortableMessage
                key={String(m.id)}
                message={m}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onTogglePin={onTogglePin}
                onToggleReaction={onToggleReaction}
                canMutate={canMutate}
                currentUserName={currentUserName}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  )
}

function SortableMessage({
  message, onUpdate, onDelete, onTogglePin, onToggleReaction, canMutate, currentUserName,
}: {
  message: ProjectMessage
  onUpdate: PinnedSortableListProps['onUpdate']
  onDelete: PinnedSortableListProps['onDelete']
  onTogglePin: PinnedSortableListProps['onTogglePin']
  onToggleReaction: PinnedSortableListProps['onToggleReaction']
  canMutate: boolean
  currentUserName: string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: String(message.id) })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  return (
    <div ref={setNodeRef} style={style}>
      <MessageItem
        message={message}
        pinned
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onTogglePin={onTogglePin}
        onToggleReaction={onToggleReaction}
        canMutate={canMutate}
        currentUserName={currentUserName}
      />
    </div>
  )
}