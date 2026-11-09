// Client onboarding questionnaire (api/_helpers/care/onboarding.ts).

export type QuestionType = 'text' | 'short_text' | 'choice' | 'link' | 'file'
export type QuestionPackages = 'both' | 'full_package' | 'editing_only'
export type OnboardingStatus = 'not_started' | 'in_progress' | 'done'

export interface FileRef { key: string; name: string; size: number; url?: string }
/** text / short_text / choice → string; link → string[]; file → FileRef[] */
export type AnswerValue = string | string[] | FileRef[] | null

export interface AskedQuestion {
  id: string
  section?: string
  text: string
  type: QuestionType
  options: string[]
  required: boolean
  value: AnswerValue
}

export interface ClientOnboarding {
  status: OnboardingStatus
  done_at: string | null
  package: 'editing_only' | 'full_package' | null
  questions: (AskedQuestion & { section: string })[]
}

export interface TeamOnboarding {
  client: { id: string; name: string }
  package: 'editing_only' | 'full_package' | null
  status: OnboardingStatus
  done_at: string | null
  answered: number
  total: number
  can_set_status: boolean
  sections: { name: string; questions: (AskedQuestion & { admin_only: boolean; updated_at: string | null; updated_by: string | null })[] }[]
}

export interface Question {
  id: string
  section: string
  text: string
  type: QuestionType
  options: string[]
  required: boolean
  admin_only: boolean
  sort_order: number
  packages: QuestionPackages
  active: boolean
}

export type QuestionBody = Partial<Omit<Question, 'id' | 'sort_order'>>
