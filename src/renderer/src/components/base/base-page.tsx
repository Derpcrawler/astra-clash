import { Button } from '@renderer/components/ui/button'
import { platform } from '@renderer/utils/init'
import { FORK } from '@renderer/fork'
import WindowControls from '@renderer/components/window-controls'
import { useAppConfig } from '@renderer/hooks/use-app-config'
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
  // Astra Clash: macOS and Windows draw native window buttons over the frameless window. Linux has
  // no such overlay, so without the system title bar the page draws its own buttons there.
  const { appConfig } = useAppConfig()
  const drawWindowControls =
    !isMac &&
    (!FORK.nativeWindowButtons || (platform === 'linux' && !(appConfig?.useWindowFrame ?? true)))
  // The slim strip on Home grows to fit drawn buttons, so the page starts below them.
  const compactClass = props.compactHeader ? (drawWindowControls ? ' compact with-wc' : ' compact') : ''

  const contentRef = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => {
    return contentRef.current as HTMLDivElement
  })

  return (
    <div ref={contentRef} className="w-full h-full">
      <div className="astra-ph sticky top-0 z-40 w-full">
        <div className={`app-drag astra-ph-row${compactClass}`}>
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
            {drawWindowControls && <WindowControls />}
          </div>
        </div>
      </div>
      <div className={`content astra-content custom-scrollbar${compactClass}`}>
        {props.children}
      </div>
    </div>
  )
})

BasePage.displayName = 'BasePage'
export default BasePage
