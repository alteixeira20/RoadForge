interface LandingSectionFrameProps {
  id?: string
  title: string
  lede?: string
  children: React.ReactNode
  className?: string
  headClassName?: string
}

export function LandingSectionFrame({
  id,
  title,
  lede,
  children,
  className,
  headClassName,
}: LandingSectionFrameProps) {
  return (
    <section className={`section container${className ? ` ${className}` : ''}`} id={id}>
      <div className={`section-head${headClassName ? ` ${headClassName}` : ''}`}>
        <h2>{title}</h2>
        {lede && <p className="section-lede">{lede}</p>}
      </div>
      {children}
    </section>
  )
}
