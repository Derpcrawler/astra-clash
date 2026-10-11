import NodePicker from '@renderer/noctur/node-picker'
import { fixedBytes } from '@renderer/noctur/format'
import Eclipse, { EclipseState } from '@renderer/noctur/eclipse'
import { useTheme } from 'next-themes'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { toast } from 'sonner'
import BasePage from '@renderer/components/base/base-page'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { useGroups } from '@renderer/hooks/use-groups'
import { updateTrayIcon, changeConnectionMethod, setConnected } from '@renderer/utils/ipc'
import { useTranslation } from 'react-i18next'
import { memo, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import {
  InfinityIcon,
  WifiOff,
  PlusCircle,
  ChevronRight,
  ChevronDown,
  Globe,
  RefreshCcw,
  CalendarClock,
  Power,
  CreditCard
} from 'lucide-react'
import { SiTelegram } from 'react-icons/si'
import EditInfoModal from '@renderer/components/profiles/edit-info-modal'
import { Spinner } from '@renderer/components/ui/spinner'
import { useTrafficStore } from '@renderer/store/traffic-store'
import UpdateLine from '@renderer/noctur/update-line'

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`
}

// Days left at which the stats block is replaced by the renewal notice
const EXPIRY_WARNING_DAYS = 3

// Module-level variable: persists across component mounts/unmounts
let connectionStartTime: number | null = null

const ConnectedTimer = memo(({ active }: { active: boolean }) => {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!active) {
      connectionStartTime = null
      setElapsed(0)
      return undefined
    }

    if (connectionStartTime === null) {
      connectionStartTime = Date.now()
    }

    const updateElapsed = (): void => {
      setElapsed(Math.floor((Date.now() - connectionStartTime!) / 1000))
    }
    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)
    return () => clearInterval(interval)
  }, [active])

  const hours = Math.floor(elapsed / 3600)
  const minutes = Math.floor((elapsed % 3600) / 60)
  const seconds = elapsed % 60
  return (
    <span>
      {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:
      {String(seconds).padStart(2, '0')}
    </span>
  )
})
ConnectedTimer.displayName = 'ConnectedTimer'

const Home: React.FC = () => {
  const { t } = useTranslation()
  const { appConfig } = useAppConfig()
  const {
    mainSwitchMode = 'tun',
    sysProxy,
    proxyMode = false,
    connectJump = true,
    look = 'noctur'
  } = appConfig || {}
  const calm = look === 'calm'
  const { resolvedTheme } = useTheme()
  const light = resolvedTheme === 'light'
  const { enable: writeSysProxy = true, mode } = sysProxy || {}
  const { controledMihomoConfig } = useControledMihomoConfig()
  const { tun } = controledMihomoConfig || {}
  const { 'mixed-port': mixedPort } = controledMihomoConfig || {}
  const sysProxyDisabled = mixedPort == 0

  const { profileConfig, addProfileItem } = useProfileConfig()
  const { groups } = useGroups()
  const hasProfiles = (profileConfig?.items?.length ?? 0) > 0
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingItem, setEditingItem] = useState<ProfileItem | null>(null)
  const [updating, setUpdating] = useState(false)

  const handleAddProfile = (): void => {
    const newProfile: ProfileItem = {
      id: '',
      name: '',
      type: 'remote',
      url: '',
      useProxy: false,
      autoUpdate: true
    }
    setEditingItem(newProfile)
    setShowEditModal(true)
  }

  const trafficInfo = useTrafficStore((s) => s.traffic)

  const [loading, setLoading] = useState(false)
  const [loadingDirection, setLoadingDirection] = useState<'connecting' | 'disconnecting'>(
    'connecting'
  )

  const isSelected = (tun?.enable ?? false) || proxyMode

  const isDisabled =
    loading ||
    (mainSwitchMode === 'sysproxy' && writeSysProxy && mode == 'manual' && sysProxyDisabled)

  const status = loading
    ? loadingDirection === 'connecting'
      ? t('pages.home.connecting')
      : t('pages.home.disconnecting')
    : isSelected
      ? t('pages.home.connected')
      : t('pages.home.disconnected')
  const showConnectedTimer = !loading && isSelected

  // Current profile & subscription
  const currentProfile = useMemo(() => {
    if (!profileConfig?.current || !profileConfig?.items) return null
    return profileConfig.items.find((item) => item.id === profileConfig.current) ?? null
  }, [profileConfig])

  const handleUpdateProfile = async (): Promise<void> => {
    if (!currentProfile || updating) return
    setUpdating(true)
    try {
      await addProfileItem(currentProfile)
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setUpdating(false)
    }
  }

  const subscription = currentProfile?.extra
  const trafficUsed = (subscription?.upload ?? 0) + (subscription?.download ?? 0)
  const trafficTotal = subscription?.total ?? 0
  const trafficRemaining = trafficTotal > 0 ? trafficTotal - trafficUsed : 0
  const expireTimestamp = subscription?.expire ?? 0
  const expireDate =
    expireTimestamp > 0 ? dayjs.unix(expireTimestamp).format('L') : t('pages.home.never')

  // Re-evaluate the countdown while the window stays open so the notice appears on time
  const [expiryTick, setExpiryTick] = useState(0)
  useEffect(() => {
    if (expireTimestamp <= 0) return undefined
    const interval = setInterval(() => setExpiryTick((n) => n + 1), 60_000)
    return () => clearInterval(interval)
  }, [expireTimestamp])

  const { daysRemaining, isExpired } = useMemo(() => {
    if (expireTimestamp <= 0) return { daysRemaining: 0, isExpired: false }
    const expiresAt = dayjs.unix(expireTimestamp)
    return {
      daysRemaining: Math.max(0, expiresAt.diff(dayjs(), 'day')),
      isExpired: expiresAt.isBefore(dayjs())
    }
  }, [expireTimestamp, expiryTick])

  const showExpiryNotice = expireTimestamp > 0 && daysRemaining <= EXPIRY_WARNING_DAYS
  const renewAction =
    currentProfile?.homeName && currentProfile?.home
      ? { url: currentProfile.home, label: currentProfile.homeName }
      : currentProfile?.supportUrl
        ? { url: currentProfile.supportUrl, label: t('pages.home.renewSubscription') }
        : null
  const expiryTitle = isExpired
    ? t('pages.home.subscriptionExpired')
    : daysRemaining === 0
      ? t('pages.home.subscriptionExpiringToday')
      : t('pages.home.subscriptionExpiring', { count: daysRemaining })

  const firstGroup = groups?.[0]
  const supportUrl = currentProfile?.supportUrl
  const supportLinkInfo = useMemo(() => {
    if (!supportUrl) return null
    try {
      const parsed = new URL(supportUrl)
      const normalized = `${parsed.hostname}${parsed.pathname}`.toLowerCase()
      return {
        href: parsed.toString(),
        isTelegram:
          parsed.protocol === 'tg:' ||
          normalized.includes('t.me') ||
          normalized.includes('telegram')
      }
    } catch {
      return null
    }
  }, [supportUrl])

  const onValueChange = async (enable: boolean): Promise<void> => {
    setLoading(true)
    setLoadingDirection(enable ? 'connecting' : 'disconnecting')
    try {
      await setConnected(enable)
      window.electron.ipcRenderer.send('updateFloatingWindow')
      window.electron.ipcRenderer.send('updateTrayMenu')
      await updateTrayIcon()
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setLoading(false)
    }
  }

  // The eclipse: dim while disconnected, pulsing while connecting, the sun up when connected.
  const eclipseState: EclipseState =
    loading && loadingDirection === 'connecting'
      ? 'connecting'
      : isSelected && !loading
        ? 'on'
        : 'off'

  // TUN or System Proxy from the method chip; reconnects through the new method when connected.
  const changeMethod = async (to: string): Promise<void> => {
    if (to === mainSwitchMode || (to !== 'tun' && to !== 'sysproxy')) return
    if (isSelected) {
      setLoading(true)
      setLoadingDirection('connecting')
    }
    try {
      await changeConnectionMethod(to)
      await updateTrayIcon()
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setLoading(false)
    }
  }
  // While connected, System Proxy with a manual proxy and no mixed port cannot carry traffic.
  const proxyUnusable = writeSysProxy && mode == 'manual' && sysProxyDisabled

  // "Updated 5 min ago · every 6 h" under the profile name (remote profiles only).
  const updatedFromNow =
    currentProfile?.type === 'remote' && currentProfile.updated
      ? dayjs(currentProfile.updated).fromNow()
      : null
  const interval = currentProfile?.type === 'remote' ? (currentProfile.interval ?? 0) : 0
  const intervalLabel =
    interval <= 0
      ? null
      : interval >= 1440
        ? `${Math.floor(interval / 1440)}${t('profile.dayShort')}`
        : interval >= 60
          ? `${Math.floor(interval / 60)}${t('profile.hourShort')}`
          : `${interval}${t('profile.minuteShort')}`

  const firstNow = firstGroup?.all?.find((p) => p.name === firstGroup.now)
  const firstDelay = firstNow?.history?.length
    ? firstNow.history[firstNow.history.length - 1].delay
    : -1
  const delayClass =
    firstDelay <= 0 ? 'bad' : firstDelay < 150 ? 'ok' : firstDelay < 400 ? 'warn' : 'bad'

  return (
    <BasePage compactHeader>
      {!hasProfiles ? (
        <div className="noctur-empty">
          <div className="noctur-empty-icon">
            <WifiOff className="size-7" />
          </div>
          <h2>{t('pages.profiles.emptyTitle')}</h2>
          <p>{t('pages.profiles.emptyDescription')}</p>
          <button
            onClick={handleAddProfile}
            data-guide="home-add-profile-btn"
            className="noctur-btn primary"
          >
            <PlusCircle className="size-4" />
            {t('pages.profiles.addProfile')}
          </button>
          {showEditModal && editingItem && (
            <EditInfoModal
              item={editingItem}
              isCurrent={false}
              updateProfileItem={async (item: ProfileItem) => {
                await addProfileItem(item)
                setShowEditModal(false)
                setEditingItem(null)
              }}
              onClose={() => {
                setShowEditModal(false)
                setEditingItem(null)
              }}
            />
          )}
        </div>
      ) : (
        <div className="noctur-home">
          <div className="noctur-home-top">
            {/* Profile card: name, update button and the subscription numbers in one row */}
            {currentProfile && (
              <div className="noctur-card noctur-prof">
                <div data-guide="home-profile-header" className="noctur-prof-id">
                  {currentProfile.logo ? (
                    <img
                      src={currentProfile.logo}
                      alt=""
                      className="noctur-logo"
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="noctur-logo">{currentProfile.name?.[0]?.toUpperCase()}</div>
                  )}
                  <div className="min-w-0">
                    <div className="noctur-prof-name">
                      <span className="truncate">{currentProfile.name}</span>
                      {currentProfile.type === 'remote' && (
                        <button
                          onClick={handleUpdateProfile}
                          disabled={updating}
                          className="noctur-ib sm"
                          title={t('pages.profiles.updateProfile', 'Update')}
                        >
                          <RefreshCcw className={`size-3.5 ${updating ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                    </div>
                    {currentProfile.announce && (
                      <div data-guide="home-profile-announce" className="noctur-prof-note">
                        {currentProfile.announce}
                      </div>
                    )}
                    {(updatedFromNow || intervalLabel || supportLinkInfo) && (
                      <div className="noctur-prof-meta">
                        {updatedFromNow && (
                          <span>
                            {t('profile.updatedAt')} {updatedFromNow}
                          </span>
                        )}
                        {intervalLabel && (
                          <span>{t('noctur.profile.every', { interval: intervalLabel })}</span>
                        )}
                        {supportLinkInfo && (
                          <button
                            data-guide="home-support-link"
                            type="button"
                            onClick={() => open(supportLinkInfo.href)}
                            className="noctur-support"
                          >
                            {supportLinkInfo.isTelegram ? (
                              <SiTelegram className="size-3" />
                            ) : (
                              <Globe className="size-3" />
                            )}
                            {t('pages.profiles.support')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {subscription && !showExpiryNotice && (
                  <>
                    <div className="noctur-stat">
                      <span>{t('pages.home.trafficRemaining')}</span>
                      <b>
                        {trafficTotal > 0 ? (
                          formatBytes(trafficRemaining)
                        ) : (
                          <InfinityIcon className="size-4.5" />
                        )}
                      </b>
                    </div>
                    <div className="noctur-stat">
                      <span>{t('pages.home.daysRemaining')}</span>
                      <b>
                        {expireTimestamp > 0 ? (
                          daysRemaining
                        ) : (
                          <InfinityIcon className="size-4.5" />
                        )}
                      </b>
                    </div>
                    <div className="noctur-stat">
                      <span>{t('pages.home.expires')}</span>
                      <b>{expireDate}</b>
                    </div>
                    {trafficTotal > 0 && (
                      <div className="noctur-usage">
                        <div className="noctur-usage-bar">
                          <i
                            style={{
                              width: `${Math.min(100, (trafficUsed / trafficTotal) * 100)}%`
                            }}
                          />
                        </div>
                        <div className="noctur-usage-meta">
                          <span>
                            {t('noctur.home.used', {
                              used: formatBytes(trafficUsed),
                              total: formatBytes(trafficTotal)
                            })}
                          </span>
                          <span>{Math.round((trafficUsed / trafficTotal) * 100)}%</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {/* Subscription expiry notice replaces the numbers near the end of the period */}
            {subscription && showExpiryNotice && (
              <div role="status" className="noctur-card noctur-expiry">
                <div className="noctur-expiry-icon">
                  <CalendarClock className="size-5" aria-hidden />
                </div>
                <div className="min-w-0 grow">
                  <p className="noctur-expiry-title">{expiryTitle}</p>
                  <p className="noctur-expiry-hint">
                    {isExpired
                      ? t('pages.home.subscriptionExpiredHint')
                      : t('pages.home.subscriptionExpiringHint', { date: expireDate })}
                  </p>
                </div>
                {renewAction && (
                  <button
                    type="button"
                    onClick={() => open(renewAction.url)}
                    className="noctur-btn primary"
                  >
                    <CreditCard className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{renewAction.label}</span>
                  </button>
                )}
              </div>
            )}
            <UpdateLine />
          </div>

          {/* Noctur: the eclipse shows the state; the button under it connects and disconnects, and
              so does a click on the moon (a mouse shortcut; keyboard and screen readers use the
              button). Calm: the power switch from Astra Clash 1.0.6 does both, with no moon. */}
          <div className="noctur-home-center">
            {calm ? (
              <button
                type="button"
                disabled={isDisabled}
                onClick={() => onValueChange(!isSelected)}
                data-guide="home-power-toggle"
                aria-label={
                  (loading ? loadingDirection === 'connecting' : !isSelected)
                    ? t('noctur.home.connect')
                    : t('noctur.home.disconnect')
                }
                className={`noctur-power${isSelected || (loading && loadingDirection === 'connecting') ? ' on' : ''}${loading ? ' busy' : ''}`}
              >
                {loading ? (
                  <Spinner className="size-12" />
                ) : (
                  <Power className="size-12" strokeWidth={2.2} />
                )}
              </button>
            ) : (
              <div className="noctur-eclipse">
                <Eclipse
                  className="noctur-eclipse-art"
                  state={eclipseState}
                  moon={light ? 'day' : 'earthshine'}
                  light={light}
                  animate={connectJump}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  disabled={isDisabled}
                  onClick={() => onValueChange(!isSelected)}
                  className="noctur-moon-button"
                />
              </div>
            )}
            <span key={status} className="noctur-state noctur-fade">
              {status}
            </span>
            <p className="noctur-substate flag-emoji">
              {showConnectedTimer ? (
                <>
                  {t('noctur.home.through', { node: firstGroup?.now || firstGroup?.name || '' })}{' '}
                  <span className="noctur-fixed">
                    <ConnectedTimer active={isSelected} />
                  </span>
                </>
              ) : !loading && currentProfile ? (
                t('noctur.home.ready', { profile: currentProfile.name })
              ) : (
                '\u00a0'
              )}
            </p>
            <div className="noctur-pills">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="noctur-chip acc noctur-chip-btn"
                    disabled={loading}
                    aria-label={t('noctur.home.method')}
                  >
                    {mainSwitchMode === 'tun' ? t('noctur.tun') : t('noctur.sysProxyShort')}
                    <ChevronDown className="size-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center">
                  <DropdownMenuRadioGroup value={mainSwitchMode} onValueChange={changeMethod}>
                    <DropdownMenuRadioItem value="tun">
                      {t('noctur.tun')}
                      <span className="noctur-method-hint">{t('noctur.home.tunHint')}</span>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="sysproxy" disabled={isSelected && proxyUnusable}>
                      {t('noctur.sysProxyShort')}
                      <span className="noctur-method-hint">{t('noctur.home.proxyHint')}</span>
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              {showConnectedTimer && (
                <span
                  className="noctur-chip mono noctur-fixed"
                  title={`↓ ${fixedBytes(trafficInfo.downTotal)} · ↑ ${fixedBytes(trafficInfo.upTotal)}`}
                >
                  ↓ {fixedBytes(trafficInfo.down, true)} · ↑ {fixedBytes(trafficInfo.up, true)}
                </span>
              )}
            </div>
            {!calm && (
              <button
                type="button"
                disabled={isDisabled}
                onClick={() => onValueChange(!isSelected)}
                data-guide="home-power-toggle"
                className={`noctur-connect${isSelected && !loading ? ' on' : ''}${loading ? ' busy' : ''}`}
              >
                {loading && <Spinner className="size-4" />}
                {(loading ? loadingDirection === 'connecting' : !isSelected)
                  ? t('noctur.home.connect')
                  : t('noctur.home.disconnect')}
              </button>
            )}
          </div>

          {/* Selected node of the first group, and the provider's support link */}
          <div className="noctur-home-foot">
            {firstGroup && (
              <NodePicker group={firstGroup}>
                <button
                  type="button"
                  data-guide="home-group-selector"
                  className="noctur-card noctur-node flag-emoji"
                >
                  <div className="noctur-node-name min-w-0 grow text-left">
                    {firstGroup.now || firstGroup.name}
                  </div>
                  {firstDelay >= 0 && (
                    <span className={`noctur-delay ${delayClass}`}>
                      {firstDelay === 0 ? 'timeout' : `${firstDelay} ms`}
                    </span>
                  )}
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              </NodePicker>
            )}
          </div>
        </div>
      )}
    </BasePage>
  )
}

export default Home
