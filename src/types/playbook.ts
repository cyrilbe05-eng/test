// Shapes returned by /api/playbook (api/_helpers/playbook/routes.ts).

export interface PlaybookAttachment { id: string; kind: 'file' | 'link'; title: string; url: string | null; fileName: string | null }

export interface PlaybookVideo {
  id: string
  title: string
  description: string
  source: 'upload' | 'youtube' | 'loom'
  thumbnailUrl: string | null
  attachments: PlaybookAttachment[]
  // Admins
  status?: 'draft' | 'published'
  externalUrl?: string | null
  fileName?: string | null
  fileSize?: number | null
  mimeType?: string | null
  hasThumbnail?: boolean
  watchedCount?: number
  updatedAt?: string
  // Clients
  watchedAt?: string | null
}

export interface PlaybookSection {
  id: string
  title: string
  videos: PlaybookVideo[]
  // Admins
  audience?: 'all' | 'selected'
  clientIds?: string[]
}

export interface PlaybookOverview { sections: PlaybookSection[] }

export interface PlaybookViewer { clientId: string; name: string; watchedAt: string | null }
