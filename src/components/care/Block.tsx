/** A titled section inside the client panel. */
export function Block({ title, children, action }: { title: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="px-5 md:px-6 py-6 border-b border-border/60">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h4 className="text-base font-semibold">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  )
}
