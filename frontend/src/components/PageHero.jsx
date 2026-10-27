export default function PageHero({ eyebrow, title, description, children }) {
  return (
    <section className="page-hero">
      <div className="page-hero-copy">
        <span className="page-hero-eyebrow">{eyebrow}</span>
        <h1 className="page-hero-title">{title}</h1>
        <p className="page-hero-description">{description}</p>
      </div>
      {children && <div className="page-hero-actions">{children}</div>}
    </section>
  )
}
