import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { Globe, Route } from 'lucide-react'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { useGroups } from '@renderer/hooks/use-groups'
import { useTrafficStore } from '@renderer/store/traffic-store'
import { useConnectionsStore } from '@renderer/store/connections-store'
import { mihomoCloseAllConnections, patchMihomoConfig } from '@renderer/utils/ipc'
import { fixedBytes } from './format'
import ConfigViewer from '@renderer/components/sider/config-viewer'
import Mark from './mark'

// Astra Clash sidebar (design/mockup.html): always open, text-only items, mark and name on top,
// Rule/Global switch and a connection status card at the bottom. Replaces components/app-sidebar.tsx.

const NAV = [
  { key: 'main', path: '/home', label: 'astra.nav.home' },
  { key: 'proxy', path: '/proxies', label: 'astra.nav.proxies' },
  { key: 'profile', path: '/profiles', label: 'astra.nav.profiles' },
  { key: 'connection', path: '/connections', label: 'astra.nav.connections' },
  { key: 'rule', path: '/rules', label: 'astra.nav.rules' },
  { key: 'log', path: '/logs', label: 'astra.nav.logs' },
  { key: 'settings', path: '/settings', label: 'astra.nav.settings' }
]
const WITHOUT_PROFILES = new Set(['main', 'profile', 'settings'])
// Sub-pages highlight the item they are opened from.
const PARENT: Record<string, string> = {
  '/mihomo': '/settings',
  '/tun': '/settings',
  '/sysproxy': '/settings',
  '/dns': '/settings',
  '/sniffer': '/settings',
  '/resources': '/rules'
}

const AstraSidebar: React.FC = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [showRuntimeConfig, setShowRuntimeConfig] = useState(false)

  // The app menu's Settings item (main/resolve/menu.ts) opens a page by path.
  useEffect(() => {
    const go = (_e: unknown, path: unknown): void => {
      if (typeof path === 'string' && path.startsWith('/')) navigate(path)
    }
    window.electron.ipcRenderer.on('astraNavigate', go)
    return (): void => {
      window.electron.ipcRenderer.removeListener('astraNavigate', go)
    }
  }, [navigate])
  const { appConfig } = useAppConfig()
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const { profileConfig } = useProfileConfig()
  const { mutate: mutateGroups } = useGroups()
  const traffic = useTrafficStore((s) => s.traffic)
  const activeConnections = useConnectionsStore((s) => s.active.length)

  const { mainSwitchMode = 'tun', proxyMode = false, autoCloseConnection = true } = appConfig || {}
  const { tun, mode } = controledMihomoConfig || {}
  const connected = (tun?.enable ?? false) || proxyMode
  const hasProfiles = (profileConfig?.items?.length ?? 0) > 0
  const current = profileConfig?.items?.find((i) => i.id === profileConfig.current)
  const showMode = hasProfiles && current?.globalMode !== false && !!mode
  const items = hasProfiles ? NAV : NAV.filter((n) => WITHOUT_PROFILES.has(n.key))
  const activePath = PARENT[location.pathname] ?? location.pathname

  const changeMode = async (next: OutboundMode): Promise<void> => {
    await patchControledMihomoConfig({ mode: next })
    await patchMihomoConfig({ mode: next })
    if (autoCloseConnection) await mihomoCloseAllConnections()
    mutateGroups()
    window.electron.ipcRenderer.send('updateTrayMenu')
  }

  return (
    <aside className="astra-side" data-guide="app-sidebar">
      <div className="astra-side-top app-drag" />
      <div className="astra-brand">
        <Mark className="size-5.5 shrink-0" />
        <span>Astra Clash</span>
      </div>
      <nav className="astra-nav">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-current={activePath.includes(item.path) ? 'page' : undefined}
            data-guide={item.key === 'main' ? 'sidebar-home-button' : undefined}
            onClick={() => navigate(item.path)}
            onDoubleClick={item.key === 'profile' ? () => setShowRuntimeConfig(true) : undefined}
          >
            <span>{t(item.label)}</span>
            {item.key === 'connection' && activeConnections > 0 && (
              <span className="astra-count">{activeConnections}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="astra-side-foot">
        {showMode && (
          <div className="astra-mode" role="group" aria-label="Rule or Global">
            {(
              [
                { value: 'rule', icon: Route, label: t('astra.rule') },
                { value: 'global', icon: Globe, label: t('astra.global') }
              ] as const
            ).map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => mode !== value && changeMode(value)}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="astra-status">
          <div className="astra-status-top">
            <span className={`astra-dot${connected ? ' on' : ''}`} />
            <span className="astra-status-label">{connected ? t('astra.connected') : t('astra.disconnected')}</span>
            <span className="astra-chip">{mainSwitchMode === 'tun' ? t('astra.tun') : t('astra.sysProxyShort')}</span>
          </div>
          <div className="astra-status-rate astra-fixed">
            <span>↓ {fixedBytes(connected ? traffic.down : 0, true)}</span>
            <span>↑ {fixedBytes(connected ? traffic.up : 0, true)}</span>
          </div>
        </div>
      </div>
      {showRuntimeConfig && <ConfigViewer onClose={() => setShowRuntimeConfig(false)} />}
    </aside>
  )
}

export default AstraSidebar
