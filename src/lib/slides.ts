import type { ProjectFile } from '@/types'

/** Files of one type in slide order (sort_order, then upload time). */
export function slidesOf<T extends Pick<ProjectFile, 'file_type' | 'sort_order' | 'created_at'>>(files: T[] | undefined, type: ProjectFile['file_type']): T[] {
  return (files ?? [])
    .filter((f) => f.file_type === type)
    .sort((a, b) => (a.sort_order ?? 1e6) - (b.sort_order ?? 1e6) || a.created_at.localeCompare(b.created_at))
}
