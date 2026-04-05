// Domain types — used across the application and matched by D1 schema in db/schema.sql

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type ProjectStatus =
  | 'pending_assignment'
  | 'in_progress'
  | 'in_review'
  | 'admin_approved'
  | 'client_reviewing'
  | 'client_approved'
  | 'revision_requested'

export type FileType = 'source_video' | 'deliverable' | 'attachment'
export type UserRole = 'admin' | 'team' | 'client'
export type CommentAuthorRole = 'admin' | 'team' | 'client'
export type NotificationType =
  | 'project_created'
  | 'team_assigned'
  | 'status_changed'
  | 'comment_added'
  | 'video_ready_for_review'
  | 'revision_requested'
  | 'project_approved'
  | 'deadline_due'

export type DeadlineStatus = 'pending' | 'met' | 'missed'

export type CalendarEventType =
  | 'project_created'
  | 'project_approved'
  | 'deadline'
  | 'milestone'
  | 'manual'

export type ContentType = 'Reel' | 'Story' | 'Carousel' | 'Post'
export type ContentStatus = 'Idea' | 'Drafting' | 'Scheduled'

// Row types
export interface Plan {
  id: string
  name: string
  max_deliverables: number
  max_client_revisions: number
  storage_limit_mb: number      // -1 = unlimited
  max_active_projects: number   // -1 = unlimited
  created_at: string
}

export interface Profile {
  id: string
  role: UserRole
  full_name: string
  email: string
  phone: string | null
  avatar_url: string | null
  plan_id: string | null
  client_id_label: string | null
  time_saved_hours: number | null
  password_changed: boolean
  disabled: boolean
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  client_id: string
  title: string
  description: string | null
  inspiration_url: string | null
  video_script: string | null
  status: ProjectStatus
  instructions: string | null
  max_deliverables: number
  max_client_revisions: number
  client_revision_count: number
  created_at: string
  updated_at: string
}

export interface ProjectFile {
  id: string
  project_id: string
  uploader_id: string
  file_type: FileType
  storage_key: string
  file_name: string
  file_size: number | null
  mime_type: string | null
  approved: boolean
  created_at: string
}

export interface ProjectAssignment {
  id: string
  project_id: string
  team_member_id: string
  assigned_by: string
  assigned_at: string
}

export interface TimelineComment {
  id: string
  project_id: string
  author_id: string
  author_role: CommentAuthorRole
  timestamp_sec: number | null
  comment_text: string
  revision_round: number
  created_at: string
}

export interface Notification {
  id: string
  recipient_id: string
  project_id: string | null
  type: NotificationType
  message: string
  read: boolean
  created_at: string
}

export interface Deadline {
  id: string
  project_id: string
  team_member_id: string
  assignment_id: string
  due_at: string
  resolved_at: string | null
  status: DeadlineStatus
  created_at: string
}

export interface TeamNote {
  id: string
  project_id: string
  author_id: string
  timestamp_sec: number | null
  text: string
  created_at: string
}

export interface CalendarEvent {
  id: string
  type: CalendarEventType
  title: string
  date: string        // ISO date string (YYYY-MM-DD)
  color: string
  projectId?: string
  deadlineId?: string
  status?: DeadlineStatus
  project_id?: string
  deadline_id?: string
  team_member_id?: string
  owner_id?: string
  // Content planning fields (manual events only)
  content_type?: ContentType | null
  content_status?: ContentStatus | null
  comments?: string | null
  double_down?: boolean
  inspiration_url?: string | null
  script?: string | null
  caption?: string | null
  assigned_client_ids?: string[]
  assigned_team_ids?: string[]
  created_at: string
}


export interface CalendarEventComment {
  id: string
  event_id: string
  author_id: string
  text: string
  created_at: string
  // joined from profiles
  author_name: string
  author_role: UserRole
  author_avatar: string | null
}

export interface GalleryFolder {
  id: string
  owner_id: string
  name: string
  parent_id: string | null
  created_at: string
}

export interface GalleryFile {
  id: string
  owner_id: string
  folder_id: string | null
  file_name: string
  file_size: number
  mime_type: string
  storage_key: string
  created_at: string
}

export interface ChatConnection {
  id: string
  user_a: string
  user_b: string
  created_at: string
}

export interface ChatGroup {
  id: string
  name: string
  created_by: string
  member_ids: string[]
  created_at: string
}

export interface ChatMessage {
  id: string
  connection_id: string | null
  group_id: string | null
  sender_id: string
  text: string
  created_at: string
  sender?: { full_name: string; role: string }
  read_by?: string[]
}

export interface Database {
  public: {
    Tables: {
      plans: { Row: Plan; Insert: Record<string, Json>; Update: Record<string, Json> }
      profiles: { Row: Profile; Insert: Record<string, Json>; Update: Record<string, Json> }
      projects: { Row: Project; Insert: Record<string, Json>; Update: Record<string, Json> }
      project_files: { Row: ProjectFile; Insert: Record<string, Json>; Update: Record<string, Json> }
      project_assignments: { Row: ProjectAssignment; Insert: Record<string, Json>; Update: Record<string, Json> }
      timeline_comments: { Row: TimelineComment; Insert: Record<string, Json>; Update: Record<string, Json> }
      notifications: { Row: Notification; Insert: Record<string, Json>; Update: Record<string, Json> }
      deadlines: { Row: Deadline; Insert: Record<string, Json>; Update: Record<string, Json> }
      team_notes: { Row: TeamNote; Insert: Record<string, Json>; Update: Record<string, Json> }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
