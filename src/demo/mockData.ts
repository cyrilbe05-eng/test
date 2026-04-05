import type {
  Profile, Project, ProjectFile, ProjectAssignment,
  TimelineComment, Notification, Plan,
} from '@/types'

// ─── Storage Files ────────────────────────────────────────────────────────────

export type StorageTag =
  | 'main_deliverable'
  | 'deliverable_version'
  | 'draft'
  | 'final'
  | 'source'
  | 'reference'
  | 'misc'
  | 'archived'

export interface StorageFile {
  id: string
  project_id: string
  uploader_id: string
  file_name: string
  file_size: number
  mime_type: string
  tag: StorageTag
  version?: number
  created_at: string
}

// ─── Plans ───────────────────────────────────────────────────────────────────

export const MOCK_PLANS: Plan[] = [
  { id: 'plan-starter', name: 'Starter', max_deliverables: 1, max_client_revisions: 2, storage_limit_mb: 20480,  max_active_projects: 2,  created_at: '2026-01-01T00:00:00Z' },
  { id: 'plan-growth',  name: 'Growth',  max_deliverables: 2, max_client_revisions: 4, storage_limit_mb: 102400, max_active_projects: 5,  created_at: '2026-01-01T00:00:00Z' },
  { id: 'plan-pro',     name: 'Pro',     max_deliverables: 5, max_client_revisions: -1, storage_limit_mb: -1,    max_active_projects: -1, created_at: '2026-01-01T00:00:00Z' },
]

// ─── Profiles ─────────────────────────────────────────────────────────────────

export const MOCK_PROFILES: Profile[] = [
  {
    id: 'user-admin',
    role: 'admin',
    full_name: 'Cyril Beaumont',
    email: 'admin@demo.com',
    phone: '+33600000001',
    avatar_url: null,
    plan_id: null,
    client_id_label: null,
    time_saved_hours: null,
    password_changed: true,
    disabled: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-editor1',
    role: 'team',
    full_name: 'Lucas Martin',
    email: 'lucas@demo.com',
    phone: '+33600000002',
    avatar_url: null,
    plan_id: null,
    client_id_label: null,
    time_saved_hours: null,
    password_changed: true,
    disabled: false,
    created_at: '2026-01-05T00:00:00Z',
    updated_at: '2026-01-05T00:00:00Z',
  },
  {
    id: 'user-editor2',
    role: 'team',
    full_name: 'Sofia Reyes',
    email: 'sofia@demo.com',
    phone: null,
    avatar_url: null,
    plan_id: null,
    client_id_label: null,
    time_saved_hours: null,
    password_changed: true,
    disabled: false,
    created_at: '2026-01-05T00:00:00Z',
    updated_at: '2026-01-05T00:00:00Z',
  },
  {
    id: 'user-client1',
    role: 'client',
    full_name: 'Amélie Dupont',
    email: 'client@demo.com',
    phone: '+33600000003',
    avatar_url: null,
    plan_id: 'plan-growth',
    client_id_label: 'CLT-001',
    time_saved_hours: 24,
    password_changed: true,
    disabled: false,
    created_at: '2026-01-10T00:00:00Z',
    updated_at: '2026-01-10T00:00:00Z',
  },
  {
    id: 'user-client2',
    role: 'client',
    full_name: 'Thomas Leblanc',
    email: 'thomas@demo.com',
    phone: '+33600000004',
    avatar_url: null,
    plan_id: 'plan-pro',
    client_id_label: 'CLT-002',
    time_saved_hours: 38,
    password_changed: true,
    disabled: false,
    created_at: '2026-01-12T00:00:00Z',
    updated_at: '2026-01-12T00:00:00Z',
  },
]

// ─── Projects ─────────────────────────────────────────────────────────────────

export const MOCK_PROJECTS: Project[] = [
  {
    id: 'proj-1',
    client_id: 'user-client1',
    title: 'Q1 Brand Launch Video',
    description: '60-second hero video for the spring campaign.',
    inspiration_url: null,
    video_script: null,
    status: 'client_reviewing',
    instructions: 'Keep the energy high. Use the upbeat track from the brief. Lower-third at 0:45 with website URL.',
    max_deliverables: 2,
    max_client_revisions: 4,
    client_revision_count: 1,
    created_at: '2026-02-01T10:00:00Z',
    updated_at: '2026-03-05T14:30:00Z',
  },
  {
    id: 'proj-2',
    client_id: 'user-client2',
    title: 'Product Demo Reel — SaaS App',
    description: 'Screen-capture walkthrough of the dashboard, 2 minutes max.',
    inspiration_url: null,
    video_script: null,
    status: 'in_review',
    instructions: 'Start with the login screen. Highlight the analytics tab at 1:10. Subtitles in French.',
    max_deliverables: 2,
    max_client_revisions: -1,
    client_revision_count: 0,
    created_at: '2026-02-10T09:00:00Z',
    updated_at: '2026-03-07T11:00:00Z',
  },
  {
    id: 'proj-3',
    client_id: 'user-client1',
    title: 'Instagram Reels Pack — March',
    description: '5 short-form vertical videos for social media.',
    inspiration_url: null,
    video_script: null,
    status: 'in_progress',
    instructions: 'Each reel max 30s. Trending audio approved by client. Captions on all.',
    max_deliverables: 5,
    max_client_revisions: 4,
    client_revision_count: 0,
    created_at: '2026-02-20T08:00:00Z',
    updated_at: '2026-03-01T16:00:00Z',
  },
  {
    id: 'proj-4',
    client_id: 'user-client2',
    title: 'CEO Interview Edit',
    description: 'Raw interview footage → polished 8-minute cut.',
    inspiration_url: null,
    video_script: null,
    status: 'revision_requested',
    instructions: 'Cut dead air. Colour grade warm. Add intro card and outro with logo.',
    max_deliverables: 1,
    max_client_revisions: -1,
    client_revision_count: 2,
    created_at: '2026-01-28T10:00:00Z',
    updated_at: '2026-03-06T09:00:00Z',
  },
  {
    id: 'proj-5',
    client_id: 'user-client1',
    title: 'Event Highlight Reel — Paris Conf',
    description: 'Best moments from the 2-day conference.',
    inspiration_url: null,
    video_script: null,
    status: 'client_approved',
    instructions: 'Focus on keynote + networking. Music: lo-fi instrumental.',
    max_deliverables: 1,
    max_client_revisions: 4,
    client_revision_count: 1,
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-02-28T12:00:00Z',
  },
  {
    id: 'proj-6',
    client_id: 'user-client2',
    title: 'Testimonial Videos — 3 clients',
    description: 'Three 90-second testimonial cuts from raw interviews.',
    inspiration_url: null,
    video_script: null,
    status: 'pending_assignment',
    instructions: 'Clean up audio, colour grade, add branded lower-thirds.',
    max_deliverables: 3,
    max_client_revisions: -1,
    client_revision_count: 0,
    created_at: '2026-03-07T09:00:00Z',
    updated_at: '2026-03-07T09:00:00Z',
  },
]

// ─── Project Files ────────────────────────────────────────────────────────────

export const MOCK_FILES: ProjectFile[] = [
  // proj-1
  {
    id: 'file-1',
    project_id: 'proj-1',
    uploader_id: 'user-client1',
    file_type: 'source_video',
    storage_key: 'projects/proj-1/source_video/raw-footage.mp4',
    file_name: 'raw-footage.mp4',
    file_size: 512000000,
    mime_type: 'video/mp4',
    approved: false,
    created_at: '2026-02-01T11:00:00Z',
  },
  {
    id: 'file-2',
    project_id: 'proj-1',
    uploader_id: 'user-editor1',
    file_type: 'deliverable',
    storage_key: 'projects/proj-1/deliverable/q1-brand-launch-v2.mp4',
    file_name: 'q1-brand-launch-v2.mp4',
    file_size: 180000000,
    mime_type: 'video/mp4',
    approved: false,
    created_at: '2026-03-04T15:00:00Z',
  },
  // proj-2
  {
    id: 'file-3',
    project_id: 'proj-2',
    uploader_id: 'user-client2',
    file_type: 'source_video',
    storage_key: 'projects/proj-2/source_video/screen-recording.mp4',
    file_name: 'screen-recording.mp4',
    file_size: 320000000,
    mime_type: 'video/mp4',
    approved: false,
    created_at: '2026-02-10T10:00:00Z',
  },
  {
    id: 'file-4',
    project_id: 'proj-2',
    uploader_id: 'user-editor2',
    file_type: 'deliverable',
    storage_key: 'projects/proj-2/deliverable/saas-demo-v1.mp4',
    file_name: 'saas-demo-v1.mp4',
    file_size: 210000000,
    mime_type: 'video/mp4',
    approved: false,
    created_at: '2026-03-07T10:00:00Z',
  },
  // proj-5 (approved)
  {
    id: 'file-5',
    project_id: 'proj-5',
    uploader_id: 'user-editor1',
    file_type: 'deliverable',
    storage_key: 'projects/proj-5/deliverable/paris-conf-highlight.mp4',
    file_name: 'paris-conf-highlight.mp4',
    file_size: 95000000,
    mime_type: 'video/mp4',
    approved: true,
    created_at: '2026-02-25T14:00:00Z',
  },
]

// ─── Project Assignments ──────────────────────────────────────────────────────

export const MOCK_ASSIGNMENTS: (ProjectAssignment & { profiles: { id: string; full_name: string; email: string; avatar_url: string | null } })[] = [
  {
    id: 'assign-1',
    project_id: 'proj-1',
    team_member_id: 'user-editor1',
    assigned_by: 'user-admin',
    assigned_at: '2026-02-02T09:00:00Z',
    profiles: { id: 'user-editor1', full_name: 'Lucas Martin', email: 'lucas@demo.com', avatar_url: null },
  },
  {
    id: 'assign-2',
    project_id: 'proj-2',
    team_member_id: 'user-editor2',
    assigned_by: 'user-admin',
    assigned_at: '2026-02-11T09:00:00Z',
    profiles: { id: 'user-editor2', full_name: 'Sofia Reyes', email: 'sofia@demo.com', avatar_url: null },
  },
  {
    id: 'assign-3',
    project_id: 'proj-3',
    team_member_id: 'user-editor1',
    assigned_by: 'user-admin',
    assigned_at: '2026-02-21T09:00:00Z',
    profiles: { id: 'user-editor1', full_name: 'Lucas Martin', email: 'lucas@demo.com', avatar_url: null },
  },
  {
    id: 'assign-4',
    project_id: 'proj-4',
    team_member_id: 'user-editor2',
    assigned_by: 'user-admin',
    assigned_at: '2026-01-29T09:00:00Z',
    profiles: { id: 'user-editor2', full_name: 'Sofia Reyes', email: 'sofia@demo.com', avatar_url: null },
  },
  {
    id: 'assign-5',
    project_id: 'proj-5',
    team_member_id: 'user-editor1',
    assigned_by: 'user-admin',
    assigned_at: '2026-01-16T09:00:00Z',
    profiles: { id: 'user-editor1', full_name: 'Lucas Martin', email: 'lucas@demo.com', avatar_url: null },
  },
]

// ─── Chat Connections (admin-controlled) ─────────────────────────────────────
// A connection lets user_a and user_b exchange DMs. Admin creates/removes them.
export interface ChatConnection {
  id: string
  user_a: string   // profile id
  user_b: string   // profile id
  created_at: string
}

// ─── Group Chats (admin-controlled) ──────────────────────────────────────────
export interface GroupChat {
  id: string
  name: string
  member_ids: string[]   // profile ids; all members can read/send
  created_at: string
}

export const _groupsStore: GroupChat[] = []

export function addGroupChat(name: string, memberIds: string[]): GroupChat {
  const group: GroupChat = {
    id: `group-${Date.now()}`,
    name: name.trim(),
    member_ids: [...new Set(memberIds)],
    created_at: new Date().toISOString(),
  }
  _groupsStore.push(group)
  return group
}

export function removeGroupChat(groupId: string) {
  const idx = _groupsStore.findIndex((g) => g.id === groupId)
  if (idx !== -1) _groupsStore.splice(idx, 1)
}

export const MOCK_CONNECTIONS: ChatConnection[] = [
  // client1 (Amélie) ↔ editor1 (Lucas)
  { id: 'conn-1', user_a: 'user-client1', user_b: 'user-editor1', created_at: '2026-02-02T09:00:00Z' },
  // client2 (Thomas) ↔ editor2 (Sofia)
  { id: 'conn-2', user_a: 'user-client2', user_b: 'user-editor2', created_at: '2026-02-11T09:00:00Z' },
]

// ─── Chat Messages ────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string
  connection_id: string
  sender_id: string
  text: string
  created_at: string
  read_by: string[]
}

export const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-1',
    connection_id: 'conn-1',
    sender_id: 'user-editor1',
    text: "Hey Amélie! I've uploaded the first cut for the Q1 video. Let me know what you think!",
    created_at: '2026-03-05T14:40:00Z',
    read_by: ['user-editor1'],
  },
  {
    id: 'msg-2',
    connection_id: 'conn-1',
    sender_id: 'user-client1',
    text: 'Thanks Lucas! Just watched it. The intro music is a bit loud but otherwise looks great.',
    created_at: '2026-03-05T15:10:00Z',
    read_by: ['user-client1', 'user-editor1'],
  },
  {
    id: 'msg-3',
    connection_id: 'conn-1',
    sender_id: 'user-editor1',
    text: "Got it — I'll lower it by ~30% and send a new version.",
    created_at: '2026-03-05T15:22:00Z',
    read_by: ['user-editor1'],
  },
  {
    id: 'msg-4',
    connection_id: 'conn-2',
    sender_id: 'user-editor2',
    text: 'Thomas, the CEO interview edit is almost done. Should I send it for internal review first?',
    created_at: '2026-03-06T08:30:00Z',
    read_by: ['user-editor2', 'user-client2'],
  },
  {
    id: 'msg-5',
    connection_id: 'conn-2',
    sender_id: 'user-client2',
    text: 'Yes please — Cyril should check it before I see it.',
    created_at: '2026-03-06T08:45:00Z',
    read_by: ['user-client2', 'user-editor2'],
  },
]

// ─── Timeline Comments ────────────────────────────────────────────────────────

export const MOCK_COMMENTS: (TimelineComment & { profiles: { full_name: string; avatar_url: string | null } })[] = [
  {
    id: 'comment-1',
    project_id: 'proj-1',
    author_id: 'user-client1',
    author_role: 'client',
    timestamp_sec: 12,
    comment_text: '[00:12] — The intro music is too loud, lower it by about 30%.',
    revision_round: 1,
    created_at: '2026-03-03T10:00:00Z',
    profiles: { full_name: 'Amélie Dupont', avatar_url: null },
  },
  {
    id: 'comment-2',
    project_id: 'proj-1',
    author_id: 'user-client1',
    author_role: 'client',
    timestamp_sec: 45,
    comment_text: '[00:45] — Add lower-third text: "New Collection → shop.amelie.fr"',
    revision_round: 1,
    created_at: '2026-03-03T10:05:00Z',
    profiles: { full_name: 'Amélie Dupont', avatar_url: null },
  },
  {
    id: 'comment-3',
    project_id: 'proj-4',
    author_id: 'user-admin',
    author_role: 'admin',
    timestamp_sec: 28,
    comment_text: '[00:28] — Cut the 4-second pause here, jump directly to the next answer.',
    revision_round: 1,
    created_at: '2026-02-15T14:00:00Z',
    profiles: { full_name: 'Cyril Beaumont', avatar_url: null },
  },
  {
    id: 'comment-4',
    project_id: 'proj-4',
    author_id: 'user-admin',
    author_role: 'admin',
    timestamp_sec: 112,
    comment_text: '[01:52] — Replace background music here, it clashes with the voiceover.',
    revision_round: 2,
    created_at: '2026-03-06T09:00:00Z',
    profiles: { full_name: 'Cyril Beaumont', avatar_url: null },
  },
]

// ─── Client Gallery ───────────────────────────────────────────────────────────
// Files owned by any user (client, team, admin).
// Organized into folders; folder_id null = root level.

export interface GalleryFolder {
  id: string
  owner_id: string       // profile id of creator (for team/admin this is their own id)
  name: string
  parent_id: string | null   // null = root
  created_at: string
}

export interface GalleryFile {
  id: string
  owner_id: string       // profile id of uploader
  folder_id: string | null   // null = root
  file_name: string
  file_size: number      // bytes
  mime_type: string
  storage_key: string
  created_at: string
}

// ─── Gallery Folders Store ────────────────────────────────────────────────────
export const _galleryFoldersStore: GalleryFolder[] = [
  { id: 'fold-1', owner_id: 'user-client1', name: 'Brand Assets', parent_id: null, created_at: '2026-01-14T09:00:00Z' },
  { id: 'fold-2', owner_id: 'user-client1', name: 'Raw Footage', parent_id: null, created_at: '2026-01-14T09:00:00Z' },
  { id: 'fold-3', owner_id: 'user-client2', name: 'Interviews', parent_id: null, created_at: '2026-01-27T08:00:00Z' },
  { id: 'fold-4', owner_id: 'user-editor1', name: 'Deliverables', parent_id: null, created_at: '2026-02-01T09:00:00Z' },
  { id: 'fold-5', owner_id: 'user-admin',   name: 'Resources',    parent_id: null, created_at: '2026-02-01T09:00:00Z' },
]

export function createGalleryFolder(ownerId: string, name: string, parentId: string | null = null): GalleryFolder {
  const f: GalleryFolder = {
    id: `fold-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    owner_id: ownerId,
    name: name.trim(),
    parent_id: parentId,
    created_at: new Date().toISOString(),
  }
  _galleryFoldersStore.push(f)
  return f
}

export function renameGalleryFolder(folderId: string, newName: string) {
  const f = _galleryFoldersStore.find((x) => x.id === folderId)
  if (f) f.name = newName.trim()
}

export function deleteGalleryFolder(folderId: string) {
  // Move all files in this folder to root
  _galleryStore.forEach((f) => { if (f.folder_id === folderId) f.folder_id = null })
  // Delete child folders recursively
  const children = _galleryFoldersStore.filter((f) => f.parent_id === folderId).map((f) => f.id)
  children.forEach(deleteGalleryFolder)
  const idx = _galleryFoldersStore.findIndex((f) => f.id === folderId)
  if (idx !== -1) _galleryFoldersStore.splice(idx, 1)
}

export function moveFileToFolder(fileId: string, folderId: string | null) {
  const f = _galleryStore.find((x) => x.id === fileId)
  if (f) f.folder_id = folderId
}

// Module-level mutable store so uploads persist within a session
export const _galleryStore: GalleryFile[] = [
  {
    id: 'gal-1',
    owner_id: 'user-client1',
    folder_id: 'fold-1',
    file_name: 'brand-guidelines-2026.pdf',
    file_size: 4200000,
    mime_type: 'application/pdf',
    storage_key: 'gallery/user-client1/brand-guidelines-2026.pdf',
    created_at: '2026-01-15T09:00:00Z',
  },
  {
    id: 'gal-2',
    owner_id: 'user-client1',
    folder_id: 'fold-2',
    file_name: 'raw-office-broll.mp4',
    file_size: 820000000,
    mime_type: 'video/mp4',
    storage_key: 'gallery/user-client1/raw-office-broll.mp4',
    created_at: '2026-02-03T11:30:00Z',
  },
  {
    id: 'gal-3',
    owner_id: 'user-client1',
    folder_id: 'fold-1',
    file_name: 'logo-animation.mov',
    file_size: 95000000,
    mime_type: 'video/quicktime',
    storage_key: 'gallery/user-client1/logo-animation.mov',
    created_at: '2026-02-10T14:00:00Z',
  },
  {
    id: 'gal-4',
    owner_id: 'user-client2',
    folder_id: 'fold-3',
    file_name: 'ceo-raw-interview.mp4',
    file_size: 2100000000,
    mime_type: 'video/mp4',
    storage_key: 'gallery/user-client2/ceo-raw-interview.mp4',
    created_at: '2026-01-28T08:00:00Z',
  },
  {
    id: 'gal-5',
    owner_id: 'user-client2',
    folder_id: null,
    file_name: 'product-screenshots.zip',
    file_size: 38000000,
    mime_type: 'application/zip',
    storage_key: 'gallery/user-client2/product-screenshots.zip',
    created_at: '2026-02-12T16:00:00Z',
  },
]

// ─── Team Notes (private per-member, visible to admin) ───────────────────────
// Module-level mutable store so notes persist within a session and are
// shared between DemoTeamProjectDetail (write) and DemoAdminProjectDetail (read).

export interface TeamNote {
  id: string
  project_id: string
  author_id: string      // team member profile id
  timestamp_sec: number | null
  text: string
  created_at: string
}

export const _teamNotesStore: TeamNote[] = []

// ─── Mutable projects store (so new projects created in-session are tracked) ──
export const _projectsStore: Project[] = [...MOCK_PROJECTS.map((p) => ({ ...p }))]

export function pushProject(p: Project) {
  _projectsStore.push(p)
}

// ─── Mutable profiles store (so plan changes persist in-session) ─────────────
export const _profilesStore: Profile[] = [...MOCK_PROFILES.map((p) => ({ ...p }))]

export function updateProfilePlan(userId: string, planId: string | null) {
  const p = _profilesStore.find((u) => u.id === userId)
  if (p) p.plan_id = planId
}

export function updateClientIdLabel(userId: string, label: string | null) {
  const p = _profilesStore.find((u) => u.id === userId)
  if (p) p.client_id_label = label ?? null
}

/** Returns "CLT-001 - Project Title" for admin/team views, or just "Project Title" if no ID set */
export function formatProjectTitle(projectTitle: string, clientId: string): string {
  const profile = _profilesStore.find((p) => p.id === clientId)
  const label = profile?.client_id_label
  return label ? `${label} - ${projectTitle}` : projectTitle
}

// ─── Notifications (mutable so we can push new ones at runtime) ───────────────
export const _notificationsStore: Notification[] = []

export function pushNotification(n: Omit<Notification, 'id' | 'read' | 'created_at'>) {
  _notificationsStore.push({
    ...n,
    id: `notif-rt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    read: false,
    created_at: new Date().toISOString(),
  })
}

// ─── Storage Files Store ─────────────────────────────────────────────────────

export const _storageStore: StorageFile[] = []

export function addStorageFile(file: Omit<StorageFile, 'id' | 'created_at'>): StorageFile {
  const existing = _storageStore.filter(
    (f) => f.project_id === file.project_id && f.tag === 'main_deliverable'
  )
  if (file.tag === 'main_deliverable' && existing.length > 0) {
    const versionCount = _storageStore.filter(
      (f) => f.project_id === file.project_id && f.tag === 'deliverable_version'
    ).length
    existing.forEach((f) => {
      f.tag = 'deliverable_version'
      f.version = versionCount + 1
    })
  }
  const sf: StorageFile = {
    ...file,
    id: `sf-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    created_at: new Date().toISOString(),
  }
  _storageStore.push(sf)
  return sf
}

export function deleteStorageFile(fileId: string) {
  const idx = _storageStore.findIndex((f) => f.id === fileId)
  if (idx !== -1) _storageStore.splice(idx, 1)
}

export function cleanupProjectStorage(projectId: string): string[] {
  const toDelete = _storageStore.filter(
    (f) => f.project_id === projectId &&
    f.tag !== 'main_deliverable' &&
    f.tag !== 'final' &&
    f.tag !== 'source'
  )
  toDelete.forEach((f) => deleteStorageFile(f.id))
  return toDelete.map((f) => f.file_name)
}

export function getProjectStorageFiles(projectId: string): StorageFile[] {
  return _storageStore.filter((f) => f.project_id === projectId)
}

// ─── Notifications ────────────────────────────────────────────────────────────

export const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: 'notif-1',
    recipient_id: 'user-admin',
    project_id: 'proj-2',
    type: 'video_ready_for_review',
    message: 'Sofia Reyes uploaded a deliverable on "Product Demo Reel — SaaS App". Ready for your review.',
    read: false,
    created_at: '2026-03-07T10:05:00Z',
  },
  {
    id: 'notif-2',
    recipient_id: 'user-admin',
    project_id: 'proj-6',
    type: 'project_created',
    message: 'Thomas Leblanc created a new project: "Testimonial Videos — 3 clients".',
    read: false,
    created_at: '2026-03-07T09:02:00Z',
  },
  {
    id: 'notif-3',
    recipient_id: 'user-admin',
    project_id: 'proj-1',
    type: 'revision_requested',
    message: 'Amélie Dupont requested a revision on "Q1 Brand Launch Video".',
    read: true,
    created_at: '2026-03-03T10:10:00Z',
  },
  {
    id: 'notif-4',
    recipient_id: 'user-client1',
    project_id: 'proj-1',
    type: 'video_ready_for_review',
    message: 'Your video for "Q1 Brand Launch Video" is ready. Watch and approve it in your workspace.',
    read: false,
    created_at: '2026-03-05T14:35:00Z',
  },
  {
    id: 'notif-5',
    recipient_id: 'user-client1',
    project_id: 'proj-5',
    type: 'project_approved',
    message: '"Event Highlight Reel — Paris Conf" has been approved. Your download is ready.',
    read: true,
    created_at: '2026-02-28T12:05:00Z',
  },
  {
    id: 'notif-6',
    recipient_id: 'user-editor1',
    project_id: 'proj-3',
    type: 'team_assigned',
    message: 'You have been assigned to "Instagram Reels Pack — March". Check your dashboard.',
    read: false,
    created_at: '2026-02-21T09:05:00Z',
  },
  {
    id: 'notif-7',
    recipient_id: 'user-client2',
    project_id: 'proj-4',
    type: 'revision_requested',
    message: 'Revision feedback has been sent for "CEO Interview Edit". The team is working on it.',
    read: true,
    created_at: '2026-03-06T09:05:00Z',
  },
]

// ─── Deadlines ────────────────────────────────────────────────────────────────
// One deadline per assignment. Auto-created 48h after assigned_at.
// status: 'pending' while open, 'met' if submitted before due_at, 'missed' if not.

export type DeadlineStatus = 'pending' | 'met' | 'missed'

export interface Deadline {
  id: string
  project_id: string
  team_member_id: string
  assignment_id: string
  due_at: string          // ISO – defaults to assigned_at + 48h, modifiable by admin
  resolved_at: string | null  // when it was marked met/missed
  status: DeadlineStatus
  created_at: string
}

// Mutable store
export const _deadlinesStore: Deadline[] = [
  // assign-1: proj-1 → Lucas, assigned 2026-02-02 → due 2026-02-04 → MET
  {
    id: 'dl-1',
    project_id: 'proj-1',
    team_member_id: 'user-editor1',
    assignment_id: 'assign-1',
    due_at: '2026-02-04T09:00:00Z',
    resolved_at: '2026-03-04T15:00:00Z',
    status: 'met',
    created_at: '2026-02-02T09:00:00Z',
  },
  // assign-2: proj-2 → Sofia, assigned 2026-02-11 → due 2026-02-13 → MET
  {
    id: 'dl-2',
    project_id: 'proj-2',
    team_member_id: 'user-editor2',
    assignment_id: 'assign-2',
    due_at: '2026-02-13T09:00:00Z',
    resolved_at: '2026-03-07T10:00:00Z',
    status: 'met',
    created_at: '2026-02-11T09:00:00Z',
  },
  // assign-3: proj-3 → Lucas, assigned 2026-02-21 → due 2026-02-23 → MISSED
  {
    id: 'dl-3',
    project_id: 'proj-3',
    team_member_id: 'user-editor1',
    assignment_id: 'assign-3',
    due_at: '2026-02-23T09:00:00Z',
    resolved_at: null,
    status: 'missed',
    created_at: '2026-02-21T09:00:00Z',
  },
  // assign-4: proj-4 → Sofia, assigned 2026-01-29 → due 2026-01-31 → MISSED
  {
    id: 'dl-4',
    project_id: 'proj-4',
    team_member_id: 'user-editor2',
    assignment_id: 'assign-4',
    due_at: '2026-01-31T09:00:00Z',
    resolved_at: null,
    status: 'missed',
    created_at: '2026-01-29T09:00:00Z',
  },
  // assign-5: proj-5 → Lucas, assigned 2026-01-16 → due 2026-01-18 → MET
  {
    id: 'dl-5',
    project_id: 'proj-5',
    team_member_id: 'user-editor1',
    assignment_id: 'assign-5',
    due_at: '2026-01-18T09:00:00Z',
    resolved_at: '2026-02-25T14:00:00Z',
    status: 'met',
    created_at: '2026-01-16T09:00:00Z',
  },
]

/** Create a deadline for a new assignment (48h after assigned_at) */
export function createDeadline(
  projectId: string,
  teamMemberId: string,
  assignmentId: string,
  assignedAt: string,
): Deadline {
  const due = new Date(new Date(assignedAt).getTime() + 48 * 60 * 60 * 1000)
  const dl: Deadline = {
    id: `dl-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    project_id: projectId,
    team_member_id: teamMemberId,
    assignment_id: assignmentId,
    due_at: due.toISOString(),
    resolved_at: null,
    status: 'pending',
    created_at: new Date().toISOString(),
  }
  _deadlinesStore.push(dl)
  return dl
}

/** Admin updates the due_at of an existing deadline */
export function updateDeadlineDueAt(deadlineId: string, dueAt: string) {
  const dl = _deadlinesStore.find((d) => d.id === deadlineId)
  if (dl) dl.due_at = dueAt
}

/** Mark a deadline as met or missed */
export function resolveDeadline(deadlineId: string, status: 'met' | 'missed') {
  const dl = _deadlinesStore.find((d) => d.id === deadlineId)
  if (dl) {
    dl.status = status
    dl.resolved_at = new Date().toISOString()
  }
}

/** Get deadline for a specific assignment */
export function getDeadlineForAssignment(assignmentId: string): Deadline | undefined {
  return _deadlinesStore.find((d) => d.assignment_id === assignmentId)
}

/** Get all deadlines for a project */
export function getDeadlinesForProject(projectId: string): Deadline[] {
  return _deadlinesStore.filter((d) => d.project_id === projectId)
}

/** Get all deadlines for a team member */
export function getDeadlinesForMember(memberId: string): Deadline[] {
  return _deadlinesStore.filter((d) => d.team_member_id === memberId)
}

// ─── Calendar Events ──────────────────────────────────────────────────────────

export type CalendarEventType = 'project_created' | 'project_approved' | 'deadline' | 'milestone' | 'manual'

export type ContentType = 'Reel' | 'Story' | 'Carousel' | 'Post'
export type ContentStatus = 'Idea' | 'Drafting' | 'Scheduled'

export interface CalendarEvent {
  id: string
  project_id: string
  type: CalendarEventType
  title: string
  date: string          // 'YYYY-MM-DD'
  color: string         // Tailwind bg color class
  deadline_id?: string
  team_member_id?: string
  owner_id?: string     // for manual events: the user who created it
  // Content planning fields (manual events only)
  content_type?: ContentType | null
  content_status?: ContentStatus | null
  comments?: string | null
  double_down?: boolean
  inspiration_url?: string | null
  script?: string | null
  caption?: string | null
  // Admin-assigned participants
  assigned_client_ids?: string[]
  assigned_team_ids?: string[]
  created_at: string
}

export const _calendarEventsStore: CalendarEvent[] = [
  { id: 'ce-1', project_id: 'proj-1', type: 'project_created', title: 'Q1 Brand Launch Video — Created', date: '2026-02-01', color: 'bg-blue-500', created_at: '2026-02-01T10:00:00Z' },
  { id: 'ce-2', project_id: 'proj-2', type: 'project_created', title: 'Product Demo Reel — Created', date: '2026-02-10', color: 'bg-blue-500', created_at: '2026-02-10T09:00:00Z' },
  { id: 'ce-3', project_id: 'proj-3', type: 'project_created', title: 'Instagram Reels Pack — Created', date: '2026-02-20', color: 'bg-blue-500', created_at: '2026-02-20T08:00:00Z' },
  { id: 'ce-4', project_id: 'proj-4', type: 'project_created', title: 'CEO Interview Edit — Created', date: '2026-01-28', color: 'bg-blue-500', created_at: '2026-01-28T10:00:00Z' },
  { id: 'ce-5', project_id: 'proj-5', type: 'project_created', title: 'Event Highlight Reel — Created', date: '2026-01-15', color: 'bg-blue-500', created_at: '2026-01-15T10:00:00Z' },
  { id: 'ce-6', project_id: 'proj-6', type: 'project_created', title: 'Testimonial Videos — Created', date: '2026-03-07', color: 'bg-blue-500', created_at: '2026-03-07T09:00:00Z' },
  { id: 'ce-7', project_id: 'proj-5', type: 'project_approved', title: 'Event Highlight Reel — Approved ✓', date: '2026-02-28', color: 'bg-green-500', created_at: '2026-02-28T12:00:00Z' },
]

export function addCalendarEvent(event: Omit<CalendarEvent, 'id' | 'created_at'>): CalendarEvent {
  const ce: CalendarEvent = {
    ...event,
    id: `ce-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    created_at: new Date().toISOString(),
  }
  _calendarEventsStore.push(ce)
  return ce
}

export function removeCalendarEvent(eventId: string) {
  const idx = _calendarEventsStore.findIndex((e) => e.id === eventId)
  if (idx !== -1) _calendarEventsStore.splice(idx, 1)
}

export function updateCalendarEventDate(eventId: string, newDate: string) {
  const ev = _calendarEventsStore.find((e) => e.id === eventId)
  if (ev) ev.date = newDate
}

export function updateCalendarEventTitle(eventId: string, newTitle: string) {
  const ev = _calendarEventsStore.find((e) => e.id === eventId)
  if (ev) ev.title = newTitle.trim()
}

export function updateCalendarEventColor(eventId: string, newColor: string) {
  const ev = _calendarEventsStore.find((e) => e.id === eventId)
  if (ev) ev.color = newColor
}

export function updateCalendarEventMeta(
  eventId: string,
  meta: {
    content_type?: ContentType | null
    content_status?: ContentStatus | null
    comments?: string | null
    double_down?: boolean
    inspiration_url?: string | null
    script?: string | null
    caption?: string | null
    assigned_client_ids?: string[]
    assigned_team_ids?: string[]
  }
) {
  const ev = _calendarEventsStore.find((e) => e.id === eventId)
  if (!ev) return
  if ('content_type'        in meta) ev.content_type        = meta.content_type
  if ('content_status'      in meta) ev.content_status      = meta.content_status
  if ('comments'            in meta) ev.comments            = meta.comments
  if ('double_down'         in meta) ev.double_down         = meta.double_down
  if ('inspiration_url'     in meta) ev.inspiration_url     = meta.inspiration_url
  if ('script'              in meta) ev.script              = meta.script
  if ('caption'             in meta) ev.caption             = meta.caption
  if ('assigned_client_ids' in meta) ev.assigned_client_ids = meta.assigned_client_ids
  if ('assigned_team_ids'   in meta) ev.assigned_team_ids   = meta.assigned_team_ids
}

// ── Calendar event comments (in-memory) ────────────────────────────────────────

export interface CalendarEventCommentMock {
  id: string
  event_id: string
  author_id: string
  text: string
  created_at: string
  author_name: string
  author_role: string
  author_avatar: string | null
}

export const _calendarCommentsStore: CalendarEventCommentMock[] = []

export function getCommentsForEvent(eventId: string): CalendarEventCommentMock[] {
  return _calendarCommentsStore.filter((c) => c.event_id === eventId)
}

export function addEventComment(
  eventId: string,
  authorId: string,
  text: string
): CalendarEventCommentMock {
  const author = MOCK_PROFILES.find((p) => p.id === authorId)
  const comment: CalendarEventCommentMock = {
    id: `cc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    event_id: eventId,
    author_id: authorId,
    text,
    created_at: new Date().toISOString(),
    author_name: author?.full_name ?? 'Unknown',
    author_role: author?.role ?? 'client',
    author_avatar: author?.avatar_url ?? null,
  }
  _calendarCommentsStore.push(comment)
  return comment
}

export function deleteEventComment(commentId: string) {
  const idx = _calendarCommentsStore.findIndex((c) => c.id === commentId)
  if (idx !== -1) _calendarCommentsStore.splice(idx, 1)
}

/** Get all calendar events visible to a role/user */
export function getCalendarEventsForUser(
  userId: string,
  role: 'admin' | 'team' | 'client',
  projectIds: string[],
): CalendarEvent[] {
  // Deadline events: built on the fly from _deadlinesStore
  const deadlineEvents: CalendarEvent[] = _deadlinesStore
    .filter((dl) => {
      if (role === 'admin') return true
      if (role === 'team') return dl.team_member_id === userId
      return false
    })
    .map((dl) => {
      const statusColor =
        dl.status === 'met' ? 'bg-green-500' :
        dl.status === 'missed' ? 'bg-red-500' :
        'bg-orange-500'
      const project = MOCK_PROJECTS.find((p) => p.id === dl.project_id)
      const member = MOCK_PROFILES.find((p) => p.id === dl.team_member_id)
      return {
        id: `dl-evt-${dl.id}`,
        project_id: dl.project_id,
        type: 'deadline' as CalendarEventType,
        title: `⏰ ${project?.title ?? dl.project_id}${role === 'admin' ? ` · ${member?.full_name ?? ''}` : ''}`,
        date: dl.due_at.slice(0, 10),
        color: statusColor,
        deadline_id: dl.id,
        team_member_id: dl.team_member_id,
        created_at: dl.created_at,
      }
    })

  const staticEvents = _calendarEventsStore.filter((e) => projectIds.includes(e.project_id))
  // Manual events: visible to creator OR if admin assigned this user to the event
  const manualEvents = _calendarEventsStore.filter((e) => {
    if (e.type !== 'manual') return false
    if (e.owner_id === userId) return true
    if (role === 'client' && e.assigned_client_ids?.includes(userId)) return true
    if (role === 'team'   && e.assigned_team_ids?.includes(userId))   return true
    return false
  })
  const merged = [...staticEvents, ...manualEvents, ...deadlineEvents]
  // De-duplicate by id
  const seen = new Set<string>()
  return merged.filter((e) => { if (seen.has(e.id)) return false; seen.add(e.id); return true })
}
