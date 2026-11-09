import { useAuth } from '@/hooks/useAuth'
import TeamDashboard from '@/pages/team/TeamDashboard'
import EditorHome from '@/pages/team/EditorHome'

// /team: editors land on their Home (my videos, limit, available work);
// copywriters keep the project board they had. The board stays at /team/all.
export default function TeamHome() {
  const { profile } = useAuth()
  return profile?.team_role === 'copywriter' ? <TeamDashboard /> : <EditorHome />
}
