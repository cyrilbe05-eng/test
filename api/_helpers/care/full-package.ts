// Full-package clients don't send footage freely: every video they create
// comes from a script the team wrote for them (shown on their Home).
// Editing-only clients and admins are not affected.

import { dbQuery } from '../db.js'
import { currentContract } from './contracts.js'

/** Is the client's current contract a full package? (false if unknown) */
export async function isFullPackage(clientId: string, now = Date.now()): Promise<boolean> {
  try {
    const ks = await dbQuery<{ start_date: string; end_date: string; package: string }>(
      'SELECT start_date, end_date, package FROM client_contracts WHERE client_id = ?', [clientId])
    return currentContract(ks, now)?.package === 'full_package'
  } catch {
    return false // pre-migration: no contracts table
  }
}

/** A script on this client's calendar (theirs, or written for them) that
 *  isn't a video yet. */
export async function isOpenScriptFor(clientId: string, eventId: string): Promise<boolean> {
  try {
    const [row] = await dbQuery<{ id: string }>(
      `SELECT e.id FROM calendar_events e
       WHERE e.id = ? AND e.project_id IS NULL
         AND (e.owner_id = ? OR EXISTS (SELECT 1 FROM calendar_event_participants c
               WHERE c.event_id = e.id AND c.profile_id = ? AND c.role = 'client'))`,
      [eventId, clientId, clientId])
    return !!row
  } catch {
    return false
  }
}
