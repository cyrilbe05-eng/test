import { useQuery } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'

/** { [galleryFileId]: signed thumbnail URL } for one owner's gallery. */
export function useGalleryThumbs(ownerId: string | undefined) {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['gallery_thumbs', ownerId],
    enabled: !!ownerId,
    staleTime: 60 * 60 * 1000,
    queryFn: () => apiFetch<Record<string, string>>(`/api/gallery/thumbnails?ownerId=${encodeURIComponent(ownerId!)}`),
  })
}
