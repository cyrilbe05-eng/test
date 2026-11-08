import DemoAdminLayout from './DemoAdminLayout'
import DemoCalendarPage from './DemoCalendarPage'

export default function DemoAdminCalendar() {
  return (
    <DemoAdminLayout>
      <main className="flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 52px)' }}>
        <DemoCalendarPage />
      </main>
    </DemoAdminLayout>
  )
}
