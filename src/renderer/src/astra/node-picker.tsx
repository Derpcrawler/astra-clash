import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronRight, Gauge } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Spinner } from '@renderer/components/ui/spinner'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useGroups } from '@renderer/hooks/use-groups'
import { mihomoChangeProxy, mihomoCloseAllConnections, mihomoGroupDelay } from '@renderer/utils/ipc'

// Astra Clash: the node card on Home opens this list of the first group's nodes, so the node can be
// changed without leaving Home. Same switching behavior as the Proxy Groups page.

function lastDelay(p?: ControllerProxiesDetail | ControllerGroupDetail): number {
  const h = p?.history
  return h && h.length ? h[h.length - 1].delay : -1
}

export function delayClass(d: number): string {
  return d <= 0 ? 'bad' : d < 150 ? 'ok' : d < 400 ? 'warn' : 'bad'
}

interface Props {
  group: ControllerMixedGroup
  children: React.ReactNode
}

const NodePicker: React.FC<Props> = ({ group, children }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { appConfig } = useAppConfig()
  const { autoCloseConnection = true } = appConfig || {}
  const { mutate } = useGroups()
  const [open, setOpen] = useState(false)
  const [testing, setTesting] = useState(false)
  // Only Selector groups can be switched by hand; others (URLTest, Fallback) pick for themselves.
  const selectable = group.type === 'Selector'

  const choose = async (name: string): Promise<void> => {
    if (!selectable || name === group.now) return
    try {
      await mihomoChangeProxy(group.name, name)
      if (autoCloseConnection) await mihomoCloseAllConnections(group.name)
      mutate()
      window.electron.ipcRenderer.send('updateTrayMenu')
      setOpen(false)
    } catch (e) {
      toast.error(`${e}`)
    }
  }

  const testAll = async (): Promise<void> => {
    setTesting(true)
    try {
      await mihomoGroupDelay(group.name, group.testUrl)
      mutate()
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="top" align="center" sideOffset={8} className="astra-picker flag-emoji">
        <div className="astra-picker-head">
          <span className="truncate">{group.name}</span>
          <button type="button" className="astra-ib sm" title={t('astra.picker.test')} disabled={testing} onClick={testAll}>
            {testing ? <Spinner className="size-3.5" /> : <Gauge className="size-3.5" />}
          </button>
        </div>
        <div className="astra-picker-list">
          {group.all.map((p) => {
            const d = lastDelay(p)
            const current = p.name === group.now
            return (
              <button
                key={p.name}
                type="button"
                aria-current={current}
                disabled={!selectable}
                onClick={() => choose(p.name)}
                className="astra-picker-item"
              >
                <Check className={`size-3.5 shrink-0 ${current ? '' : 'invisible'}`} />
                <span className="truncate grow text-left">{p.name}</span>
                {d >= 0 && <span className={`astra-delay ${delayClass(d)}`}>{d === 0 ? 'timeout' : `${d} ms`}</span>}
              </button>
            )
          })}
        </div>
        {!selectable && <div className="astra-picker-note">{t('astra.picker.auto')}</div>}
        <button
          type="button"
          className="astra-picker-foot"
          onClick={() => navigate('/proxies', { state: { fromHome: true } })}
        >
          {t('astra.picker.all')}
          <ChevronRight className="size-3.5" />
        </button>
      </PopoverContent>
    </Popover>
  )
}

export default NodePicker
