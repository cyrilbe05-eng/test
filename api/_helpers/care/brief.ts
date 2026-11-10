// A client's working brief: Miro board, SOPs (recurring feedback rules) and
// style (their "Your style" onboarding answers). Shown on the client's Home
// on the copywriter's client page, and on the team project page (editors too).
//
//   GET /api/team/clients/:id/brief   all admins and the whole team

import { dbQuery } from '../db.js'
import { loadClientRevisions } from './sop.js'
import { loadQuestions, fromStored, isAnswered, type AnswerValue, type QuestionType } from './onboarding.js'

/** Onboarding section whose answers are the client's style. */
export const STYLE_SECTION = 'Your style'

export interface Brief {
  miro_url: string | null
  sops: string[]
  style: { question: string; type: QuestionType; value: AnswerValue }[]
}

export async function loadBrief(clientId: string): Promise<Brief> {
  const [[care], revisions, questions, answers] = await Promise.all([
    dbQuery<{ miro_url: string | null }>('SELECT miro_url FROM client_care WHERE client_id = ?', [clientId]),
    loadClientRevisions(clientId).catch(() => ({ sop_rules: [] as { text: string; count: number }[] })),
    loadQuestions(),
    dbQuery<{ question_id: string; answer: string | null; file_url: string | null }>(
      'SELECT question_id, answer, file_url FROM onboarding_answers WHERE client_id = ?', [clientId]),
  ])
  const byQ = new Map(answers.map((a) => [a.question_id, a]))
  const style = questions
    .filter((q) => q.section === STYLE_SECTION && !q.admin_only && q.type !== 'file')
    .flatMap((q) => {
      const row = byQ.get(q.id)
      const value = row ? fromStored(q, row) : null
      return isAnswered(q, value) ? [{ question: q.text, type: q.type, value: value! }] : []
    })
  return {
    miro_url: care?.miro_url ?? null,
    sops: [...revisions.sop_rules].sort((a, b) => b.count - a.count).map((r) => r.text),
    style,
  }
}
