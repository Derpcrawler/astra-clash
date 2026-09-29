import { Button } from '@renderer/components/ui/button'
import { platform } from '@renderer/utils/init'
import { FORK } from '@renderer/fork'
import WindowControls from '@renderer/components/window-controls'
import React, { forwardRef, useImperativeHandle, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

const sidebarPaths = new Set(['/home', '/profiles', '/proxies', '/connections', '/rules', '/logs', '/settings'])
const isMac = platform === 'darwin'

interface Props {
  title?: React.ReactNode
  header?: React.ReactNode
  children?: React.ReactNode
  contentClassName?: string
  showBackButton?: boolean
  // Astra Clash: a slim drag strip instead of the title row, for pages without a title (Home).
  compactHeader?: boolean
}

const BasePage = forwardRef<HTMLDivElement, Props>((props, ref) => {
  const location = useLocation()
  const navigate = useNavigate()
  const isSubPage = !sidebarPaths.has(location.pathname)

  const contentRef = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => {
    return contentRef.current as HTMLDivElement
  })

  return (
    <div ref={contentRef} className="w-full h-full">
      <div className="astra-ph sticky top-0 z-40 w-full">
        <div className={`app-drag astra-ph-row${props.compactHeader ? ' compact' : ''}`}>
          <div className="title astra-ph-title">
            {(isSubPage || props.showBackButton) && (
              <Button
                size="icon-sm"
                variant="ghost"
                className="app-nodrag"
                onClick={() => navigate(-1)}
              >
                <ChevronLeft className="size-4.5" />
              </Button>
            )}
            {props.title}
          </div>
          <div className="header astra-ph-acts">
            {props.header}
            {!isMac && !FORK.nativeWindowButtons && <WindowControls />}
          </div>
        </div>
      </div>
      <div className={`content astra-content custom-scrollbar${props.compactHeader ? ' compact' : ''}`}>
        {props.children}
      </div>
    </div>
  )
})

BasePage.displayName = 'BasePage'
export default BasePage
