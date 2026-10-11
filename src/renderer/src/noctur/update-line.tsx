import React from 'react'
import useSWR from 'swr'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import { useShallow } from 'zustand/react/shallow'
import { AlertTriangle } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Spinner } from '@renderer/components/ui/spinner'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useUpdaterStore } from '@renderer/store/updater-store'
import { cancelUpdate, checkUpdate, downloadAndInstallUpdate } from '@renderer/utils/ipc'
import { platform } from '@renderer/utils/init'
import moonBlue from '@renderer/assets/moon/blue.png'

// Home, under the subscription card: a plain line when a newer Noctur is on GitHub. It names the
// app and carries its moon so it does not read as a subscription notice.
// The same line shows the download, the step waiting for the system prompt, and a failure. Checks
// run at start and every 6 hours unless turned off in Settings; a failed check shows nothing.

export const UPDATE_KEY = 'checkUpdate'
const SIX_HOURS = 6 * 60 * 60 * 1000

export function useLatestUpdate(): AppVersion | undefined {
  const { appConfig } = useAppConfig()
  const enabled = appConfig ? appConfig.checkUpdates !== false : false
  const { data } = useSWR(enabled ? UPDATE_KEY : null, checkUpdate, {
    refreshInterval: SIX_HOURS,
    revalidateOnFocus: false,
    shouldRetryOnError: false
  })
  return data
}

const UpdateLine: React.FC = () => {
  const { t } = useTranslation()
  const latest = useLatestUpdate()
  const status = useUpdaterStore(useShallow((s) => s.status))
  if (!latest) return null
  const v = latest.version
  const page = (): void => {
    if (latest.page) open(latest.page)
  }
  const install = (): void => {
    if (!latest.installable) return page()
    useUpdaterStore.getState().setStatus({ phase: 'downloading', progress: 0 })
    downloadAndInstallUpdate(v).catch(() => {
      // the line shows the failure (update-status)
    })
  }
  const mark = <img src={moonBlue} alt="" className="noctur-update-mark" />

  if (status.phase === 'downloading') {
    return (
      <div className="noctur-update" role="status">
        {mark}
        <span>{t('noctur.update.downloading', { version: v })}</span>
        <span className="noctur-update-bar" aria-hidden>
          <i style={{ width: `${status.progress}%` }} />
        </span>
        <span className="noctur-update-pct">{status.progress}%</span>
        <button type="button" className="noctur-update-link" onClick={() => cancelUpdate()}>
          {t('noctur.update.cancel')}
        </button>
      </div>
    )
  }
  if (
    status.phase === 'confirm' ||
    status.phase === 'installing' ||
    status.phase === 'restarting'
  ) {
    // macOS: the password prompt, installing, then restarting. Windows: the app closes at once and
    // the installer (after UAC) opens the new version.
    const text =
      platform !== 'darwin'
        ? t('noctur.update.closingWin', { version: v })
        : status.phase === 'confirm'
          ? t('noctur.update.confirmMac', { version: v })
          : status.phase === 'installing'
            ? t('noctur.update.installing', { version: v })
            : t('noctur.update.restarting')
    return (
      <div className="noctur-update" role="status">
        {mark}
        <Spinner className="size-3.5" />
        <span>{text}</span>
      </div>
    )
  }
  if (status.phase === 'error' && status.error !== 'cancelled') {
    return (
      <div className="noctur-update" role="alert">
        <AlertTriangle className="noctur-update-warn" aria-hidden />
        <span>
          {status.error === 'install'
            ? t('noctur.update.failedInstall', { version: v })
            : t('noctur.update.failedDownload', { version: v })}
        </span>
        <button type="button" className="noctur-update-link" onClick={page}>
          {t('noctur.update.fromGitHub')}
        </button>
        <button type="button" className="noctur-update-btn" onClick={install}>
          {t('noctur.update.tryAgain')}
        </button>
      </div>
    )
  }
  return (
    <div className="noctur-update">
      {mark}
      <span>
        {t('noctur.update.available')} <b>{v}</b>
      </span>
      {latest.changelog.trim() && (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="noctur-update-link">
              {t('noctur.update.whatsNew')}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="noctur-update-notes">
            <p className="noctur-update-notes-title">
              {t('noctur.update.notesTitle', { version: v })}
            </p>
            <div className="noctur-update-notes-body">
              <ReactMarkdown
                components={{
                  a: ({ ...props }) => <a target="_blank" rel="noreferrer" {...props} />
                }}
              >
                {latest.changelog}
              </ReactMarkdown>
            </div>
            <div className="noctur-update-notes-foot">
              <button type="button" className="noctur-update-link" onClick={page}>
                {t('noctur.update.onGitHub')}
              </button>
              <button type="button" className="noctur-update-btn" onClick={install}>
                {latest.installable ? t('noctur.update.update') : t('noctur.update.download')}
              </button>
            </div>
          </PopoverContent>
        </Popover>
      )}
      <button type="button" className="noctur-update-btn" onClick={install}>
        {latest.installable ? t('noctur.update.update') : t('noctur.update.download')}
      </button>
    </div>
  )
}

export default UpdateLine
