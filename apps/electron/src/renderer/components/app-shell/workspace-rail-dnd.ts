import { arrayMove } from '@dnd-kit/sortable'

export function computeOrderAfterDrag(
  currentIds: string[],
  activeId: string,
  overId: string | null,
): string[] | null {
  if (overId === null || activeId === overId) return null
  const oldIndex = currentIds.indexOf(activeId)
  const newIndex = currentIds.indexOf(overId)
  if (oldIndex === -1 || newIndex === -1) return null
  return arrayMove(currentIds, oldIndex, newIndex)
}
