/** A titled section inside the client panel. */
export function Block({ title, children, action }: { title: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="px-4 md:px-5 py-4 border-b border-border/60">
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <h4 className="text-sm font-semibold">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  )
}
