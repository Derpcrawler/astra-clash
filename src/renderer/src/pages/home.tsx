import NodePicker from '@renderer/astra/node-picker'
import { fixedBytes } from '@renderer/astra/format'
import { jumpFrom } from '@renderer/astra/backdrop'
import { toast } from 'sonner'
import BasePage from '@renderer/components/base/base-page'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { useGroups } from '@renderer/hooks/use-groups'
import { triggerSysProxy, updateTrayIcon, mihomoHotReloadConfig } from '@renderer/utils/ipc'
import { useTranslation } from 'react-i18next'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import {
  InfinityIcon,
  WifiOff,
  PlusCircle,
  ChevronRight,
  Globe,
  ArrowUp,
  ArrowDown,
  RefreshCcw,
  CalendarClock,
  CreditCard,
  Power
} from 'lucide-react'
import { SiTelegram } from 'react-icons/si'
import EditInfoModal from '@renderer/components/profiles/edit-info-modal'
import { Spinner } from '@renderer/components/ui/spinner'
import { CharacterMorph } from '@renderer/components/ui/character-morph'
import { useTrafficStore } from '@renderer/store/traffic-store'

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
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    mainSwitchMode = 'tun',
    sysProxy,
    proxyMode = false,
    onlyActiveDevice = false
  } = appConfig || {}
  const { enable: writeSysProxy = true, mode } = sysProxy || {}
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
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
  const statusWidthTexts = [
    t('pages.home.connecting'),
    t('pages.home.disconnecting'),
    t('pages.home.connected'),
    t('pages.home.disconnected')
  ]
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

  const powerButtonRef = useRef<HTMLButtonElement>(null)

  const onValueChange = async (enable: boolean): Promise<void> => {
    setLoading(true)
    setLoadingDirection(enable ? 'connecting' : 'disconnecting')
    if (enable) jumpFrom(powerButtonRef.current)
    try {
      if (enable) {
        if (mainSwitchMode === 'tun') {
          await patchControledMihomoConfig({ tun: { enable: true }, dns: { enable: true } })
          await mihomoHotReloadConfig()
        } else {
          if (writeSysProxy && mode == 'manual' && sysProxyDisabled) return
          await patchAppConfig({ proxyMode: true })
          await mihomoHotReloadConfig()
          if (writeSysProxy) {
            await triggerSysProxy(true, onlyActiveDevice)
          }
        }
      } else {
        const tunWasEnabled = tun?.enable ?? false
        const proxyModeWasEnabled = proxyMode
        if (tunWasEnabled) {
          await patchControledMihomoConfig({ tun: { enable: false } })
        }
        if (proxyModeWasEnabled) {
          if (writeSysProxy) {
            await triggerSysProxy(false, onlyActiveDevice)
          }
          await patchAppConfig({ proxyMode: false })
        }
        if (tunWasEnabled || proxyModeWasEnabled) {
          await mihomoHotReloadConfig()
        }
      }
      window.electron.ipcRenderer.send('updateFloatingWindow')
      window.electron.ipcRenderer.send('updateTrayMenu')
      await updateTrayIcon()
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setLoading(false)
    }
  }

  // "Updated 5 min ago · every 6 h" under the profile name (remote profiles only).
  const updatedFromNow =
    currentProfile?.type === 'remote' && currentProfile.updated ? dayjs(currentProfile.updated).fromNow() : null
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
  const firstDelay = firstNow?.history?.length ? firstNow.history[firstNow.history.length - 1].delay : -1
  const delayClass = firstDelay <= 0 ? 'bad' : firstDelay < 150 ? 'ok' : firstDelay < 400 ? 'warn' : 'bad'

  return (
    <BasePage compactHeader>
      {!hasProfiles ? (
        <div className="astra-empty">
          <div className="astra-empty-icon">
            <WifiOff className="size-7" />
          </div>
          <h2>{t('pages.profiles.emptyTitle')}</h2>
          <p>{t('pages.profiles.emptyDescription')}</p>
          <button
            onClick={handleAddProfile}
            data-guide="home-add-profile-btn"
            className="astra-btn primary"
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
        <div className="astra-home">
          <div className="astra-home-top">
            {/* Profile card: name, update button and the subscription numbers in one row */}
            {currentProfile && (
              <div className="astra-card astra-prof">
                <div data-guide="home-profile-header" className="astra-prof-id">
                  {currentProfile.logo ? (
                    <img
                      src={currentProfile.logo}
                      alt=""
                      className="astra-logo"
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="astra-logo">{currentProfile.name?.[0]?.toUpperCase()}</div>
                  )}
                  <div className="min-w-0">
                    <div className="astra-prof-name">
                      <span className="truncate">{currentProfile.name}</span>
                      {currentProfile.type === 'remote' && (
                        <button
                          onClick={handleUpdateProfile}
                          disabled={updating}
                          className="astra-ib sm"
                          title={t('pages.profiles.updateProfile', 'Update')}
                        >
                          <RefreshCcw className={`size-3.5 ${updating ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                    </div>
                    {currentProfile.announce && (
                      <div data-guide="home-profile-announce" className="astra-prof-note">
                        {currentProfile.announce}
                      </div>
                    )}
                    {(updatedFromNow || intervalLabel || supportLinkInfo) && (
                      <div className="astra-prof-meta">
                        {updatedFromNow && (
                          <span>
                            {t('profile.updatedAt')} {updatedFromNow}
                          </span>
                        )}
                        {intervalLabel && <span>{t('astra.profile.every', { interval: intervalLabel })}</span>}
                        {supportLinkInfo && (
                          <button
                            data-guide="home-support-link"
                            type="button"
                            onClick={() => open(supportLinkInfo.href)}
                            className="astra-support"
                          >
                            {supportLinkInfo.isTelegram ? <SiTelegram className="size-3" /> : <Globe className="size-3" />}
                            {t('pages.profiles.support')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {subscription && !showExpiryNotice && (
                  <>
                    <div className="astra-stat">
                      <span>{t('pages.home.trafficRemaining')}</span>
                      <b>{trafficTotal > 0 ? formatBytes(trafficRemaining) : <InfinityIcon className="size-4.5" />}</b>
                    </div>
                    <div className="astra-stat">
                      <span>{t('pages.home.daysRemaining')}</span>
                      <b>{expireTimestamp > 0 ? daysRemaining : <InfinityIcon className="size-4.5" />}</b>
                    </div>
                    <div className="astra-stat">
                      <span>{t('pages.home.expires')}</span>
                      <b>{expireDate}</b>
                    </div>
                  </>
                )}
              </div>
            )}
            {/* Subscription expiry notice replaces the numbers near the end of the period */}
            {subscription && showExpiryNotice && (
              <div role="status" className="astra-card astra-expiry">
                <div className="astra-expiry-icon">
                  <CalendarClock className="size-5" aria-hidden />
                </div>
                <div className="min-w-0 grow">
                  <p className="astra-expiry-title">{expiryTitle}</p>
                  <p className="astra-expiry-hint">
                    {isExpired
                      ? t('pages.home.subscriptionExpiredHint')
                      : t('pages.home.subscriptionExpiringHint', { date: expireDate })}
                  </p>
                </div>
                {renewAction && (
                  <button type="button" onClick={() => open(renewAction.url)} className="astra-btn primary">
                    <CreditCard className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{renewAction.label}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Power button, status under it, then timer and traffic when connected */}
          <div className="astra-home-center">
            <button
              ref={powerButtonRef}
              disabled={isDisabled}
              onClick={() => onValueChange(!isSelected)}
              data-guide="home-power-toggle"
              aria-label={status}
              className={`astra-power${isSelected || (loading && loadingDirection === 'connecting') ? ' on' : ''}${loading ? ' busy' : ''}`}
            >
              {loading ? <Spinner className="size-12" /> : <Power className="size-12" strokeWidth={2.2} />}
            </button>
            <CharacterMorph
              texts={[status]}
              reserveTexts={statusWidthTexts}
              interval={3000}
              className="astra-state"
            />
            <div className="astra-pills">
              <span className="astra-chip acc">{mainSwitchMode === 'tun' ? t('astra.tun') : t('astra.sysProxy')}</span>
              <span className="astra-chip">
                {controledMihomoConfig?.mode === 'global' ? t('astra.global') : t('astra.rule')}
              </span>
              {showConnectedTimer && (
                <span className="astra-chip mono astra-fixed">
                  ↓ {fixedBytes(trafficInfo.down, true)} · ↑ {fixedBytes(trafficInfo.up, true)}
                </span>
              )}
            </div>
            <div aria-hidden={!showConnectedTimer} className={`astra-timer${showConnectedTimer ? ' show' : ''}`}>
              <ConnectedTimer active={isSelected} />
              <span className="astra-fixed">
                <ArrowDown className="size-3" /> {fixedBytes(trafficInfo.downTotal)}
                <ArrowUp className="size-3 ml-2" /> {fixedBytes(trafficInfo.upTotal)}
              </span>
            </div>
          </div>

          {/* Selected node of the first group, and the provider's support link */}
          <div className="astra-home-foot">
            {firstGroup && (
              <NodePicker group={firstGroup}>
              <button
                type="button"
                data-guide="home-group-selector"
                className="astra-card astra-node flag-emoji"
              >
                <div className="astra-node-name min-w-0 grow text-left">{firstGroup.now || firstGroup.name}</div>
                {firstDelay >= 0 && (
                  <span className={`astra-delay ${delayClass}`}>{firstDelay === 0 ? 'timeout' : `${firstDelay} ms`}</span>
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
