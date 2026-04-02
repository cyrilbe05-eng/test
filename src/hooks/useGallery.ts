import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import type { GalleryFile, GalleryFolder } from '@/types'

export function useGalleryFiles(ownerId?: string) {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['gallery_files', ownerId],
    enabled: !!ownerId,
    queryFn: () =>
      apiFetch<GalleryFile[]>(`/api/gallery?ownerId=${ownerId}`),
  })
}

export function useGalleryFolders(ownerId?: string) {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['gallery_folders', ownerId],
    enabled: !!ownerId,
    queryFn: () =>
      apiFetch<GalleryFolder[]>(`/api/gallery/folders?ownerId=${ownerId}`),
  })
}

export function useCreateFolder() {
  const qc = useQueryClient()
  const apiFetch = useApiFetch()
  return useMutation({
    mutationFn: ({ ownerId, name, parentId }: { ownerId: string; name: string; parentId?: string | null }) =>
      apiFetch<GalleryFolder>('/api/gallery/folders', {
        method: 'POST',
        body: JSON.stringify({ ownerId, name, parentId }),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['gallery_folders', variables.ownerId] })
    },
  })
}

export function useRenameFolder() {
  const qc = useQueryClient()
  const apiFetch = useApiFetch()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string; ownerId: string }) =>
      apiFetch<GalleryFolder>(`/api/gallery/folders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['gallery_folders', variables.ownerId] })
    },
  })
}

export function useDeleteFolder() {
  const qc = useQueryClient()
  const apiFetch = useApiFetch()
  return useMutation({
    mutationFn: ({ id }: { id: string; ownerId: string }) =>
      apiFetch(`/api/gallery/folders/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['gallery_folders', variables.ownerId] })
      qc.invalidateQueries({ queryKey: ['gallery_files', variables.ownerId] })
    },
  })
}

export function useMoveFile() {
  const qc = useQueryClient()
  const apiFetch = useApiFetch()
  return useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null; ownerId: string }) =>
      apiFetch<GalleryFile>(`/api/gallery/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ folderId }),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['gallery_files', variables.ownerId] })
    },
  })
}

export function useDeleteGalleryFile() {
  const qc = useQueryClient()
  const apiFetch = useApiFetch()
  return useMutation({
    mutationFn: ({ id }: { id: string; ownerId: string }) =>
      apiFetch(`/api/gallery/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['gallery_files', variables.ownerId] })
    },
  })
}

export function useGallerySignedUrl(fileId: string | null) {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['gallery_signed_url', fileId],
    enabled: !!fileId,
    queryFn: () =>
      apiFetch<{ url: string }>(`/api/gallery/${fileId}/signed-url`),
    staleTime: 1000 * 60 * 4, // 4 min — signed URLs typically expire in 5
  })
}
