import React from 'react'

interface Props {
  title: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  // Kept for upstream callers. Rows are separated by hairlines in CSS now.
  divider?: boolean
}

const SettingItem: React.FC<Props> = (props) => {
  const { title, actions, children } = props

  return (
    <div className="noctur-row">
      <div className="noctur-row-label">
        <h4>{title}</h4>
        {actions && <div className="noctur-row-acts">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export default SettingItem
