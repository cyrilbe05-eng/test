import { useApiFetch } from './api'
import type { FileType } from '@/types'

export interface StorageAdapter {
  /** Upload a file. Returns an opaque storage key — never a URL. */
  upload(params: {
    file: File
    projectId: string
    fileType: FileType
    onProgress?: (percent: number) => void
  }): Promise<{ key: string }>

  /** Get a short-lived signed URL. Never cache or persist this. */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>

  /** Hard delete a file by key. (Requires the file's D1 id) */
  deleteById(id: string): Promise<void>
}

/**
 * Creates a storage adapter bound to an apiFetch instance.
 * Must be called inside a React component or hook (uses useApiFetch internally).
 */
export function useStorageAdapter(): StorageAdapter {
  const apiFetch = useApiFetch()

  return {
    async upload({ file, projectId, fileType, onProgress }) {
      // 1. Get a pre-signed R2 upload URL from the API
      const { uploadUrl, key } = await apiFetch<{ uploadUrl: string; key: string }>(
        '/api/project-files/upload-url',
        {
          method: 'POST',
          body: JSON.stringify({
            projectId,
            fileType,
            fileName: file.name,
            mimeType: file.type,
          }),
        }
      )

      // 2. PUT directly to R2 using XMLHttpRequest (enables real progress events)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            onProgress?.(Math.round((e.loaded / e.total) * 100))
          }
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress?.(100)
            resolve()
          } else {
            reject(new Error(`R2 upload failed with status ${xhr.status}`))
          }
        }

        xhr.onerror = () => reject(new Error('R2 upload network error'))
        xhr.send(file)
      })

      // 3. Register the file row in D1
      await apiFetch('/api/project-files/register', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          file_type: fileType,
          storage_key: key,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
        }),
      })

      return { key }
    },

    async getSignedUrl(_key, _expiresInSeconds = 3600) {
      // This method cannot work correctly: the signed-url endpoint requires a
      // database file id (UUID), not a storage key path. Use getSignedUrlById
      // instead, which takes the file id directly.
      throw new Error('getSignedUrl(key) is not supported. Use getSignedUrlById(apiFetch, fileId) instead.')
    },

    async deleteById(id: string) {
      await apiFetch(`/api/project-files/${id}`, { method: 'DELETE' })
    },
  }
}

// Keep a plain (non-hook) version for components that use getSignedUrl by file id
export async function getSignedUrlById(apiFetch: ReturnType<typeof useApiFetch>, fileId: string): Promise<string> {
  const { signedUrl } = await apiFetch<{ signedUrl: string }>(
    `/api/project-files/${fileId}/signed-url`
  )
  return signedUrl
}
