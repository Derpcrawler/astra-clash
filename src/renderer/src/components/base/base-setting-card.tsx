import React from 'react'

interface Props {
  title?: string
  children?: React.ReactNode
  className?: string
}

// Noctur: sections are always open. A title becomes a small heading above the card,
// instead of the upstream accordion that started collapsed.
const SettingCard: React.FC<Props> = (props) => {
  return (
    <section className={`noctur-sec ${props.className ?? ''}`}>
      {props.title && <h3 className="noctur-sec-title">{props.title}</h3>}
      <div className="noctur-card noctur-rows">{props.children}</div>
    </section>
  )
}

export default SettingCard
