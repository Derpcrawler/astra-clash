import React from 'react'

interface Props {
  title?: string
  children?: React.ReactNode
  className?: string
}

// Astra Clash: sections are always open. A title becomes a small heading above the card,
// instead of the upstream accordion that started collapsed.
const SettingCard: React.FC<Props> = (props) => {
  return (
    <section className={`astra-sec ${props.className ?? ''}`}>
      {props.title && <h3 className="astra-sec-title">{props.title}</h3>}
      <div className="astra-card astra-rows">{props.children}</div>
    </section>
  )
}

export default SettingCard
