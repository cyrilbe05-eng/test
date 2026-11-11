import { useClientDashboard } from '@/hooks/useClientDashboard'

/** Full-package clients only record the scripts written for them (Home →
 *  Upload), so they get no free "New video". Hidden until the contract is
 *  known, so the button never flashes for them. */
export function useCanCreateVideo(): boolean {
  const { data } = useClientDashboard()
  return !!data && data.contract?.package !== 'full_package'
}

export function useIsFullPackage(): boolean | undefined {
  const { data } = useClientDashboard()
  return data ? data.contract?.package === 'full_package' : undefined
}
