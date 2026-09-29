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
    <div className="astra-row">
      <div className="astra-row-label">
        <h4>{title}</h4>
        {actions && <div className="astra-row-acts">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export default SettingItem
