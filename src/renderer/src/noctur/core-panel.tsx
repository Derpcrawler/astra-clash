import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Download } from 'lucide-react'
import SettingCard from '@renderer/components/base/base-setting-card'
import SettingItem from '@renderer/components/base/base-setting-item'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import { CoreRelease, CoreState, coreState, downloadCore, latestCore, removeCore, useDownloadedCore } from './core-ipc'

// Noctur: download a newer mihomo core from Settings, Core.
const CorePanel: React.FC = () => {
  const { t } = useTranslation()
  const [state, setState] = useState<CoreState>({ active: null, installed: [], builtIn: null })
  const [latest, setLatest] = useState<CoreRelease | null>(null)
  const [latestError, setLatestError] = useState('')
  const [busy, setBusy] = useState('')

  const refresh = useCallback(async () => {
    setState(await coreState())
  }, [])

  useEffect(() => {
    refresh().catch(() => {})
    latestCore()
      .then(setLatest)
      .catch((e) => setLatestError(String(e?.message ?? e)))
  }, [refresh])

  const run = async (key: string, fn: () => Promise<unknown>, done?: string): Promise<void> => {
    setBusy(key)
    try {
      await fn()
      await refresh()
      if (done) toast.success(done)
    } catch (e) {
      const msg = String((e as Error)?.message ?? e)
      if (!/User canceled|-128/.test(msg)) toast.error(msg)
    } finally {
      setBusy('')
    }
  }

  const newest = latest?.version
  const haveNewest = !!newest && state.installed.includes(newest)

  return (
    <SettingCard title={t('noctur.core.title')}>
      <SettingItem title={t('noctur.core.inUse')}>
        <div className="flex items-center gap-2">
          <span className="noctur-chip acc">
            {state.active ?? `${t('noctur.core.builtIn')}${state.builtIn ? ` ${state.builtIn}` : ''}`}
          </span>
          {state.active && (
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run('builtin', () => useDownloadedCore(null))}>
              {busy === 'builtin' && <Spinner />}
              {t('noctur.core.useBuiltIn')}
            </Button>
          )}
        </div>
      </SettingItem>
      <SettingItem title={t('noctur.core.newest')}>
        {latestError ? (
          <span className="text-xs text-muted-foreground max-w-80 truncate" title={latestError}>
            {t('noctur.core.checkFailed')}
          </span>
        ) : !latest ? (
          <Spinner />
        ) : !state.active && newest === state.builtIn ? (
          <span className="noctur-chip">{t('noctur.core.upToDate', { version: newest })}</span>
        ) : haveNewest ? (
          <div className="flex items-center gap-2">
            <span className="noctur-chip">{newest}</span>
            {state.active !== newest && (
              <Button size="sm" disabled={!!busy} onClick={() => run('use', () => useDownloadedCore(newest!))}>
                {busy === 'use' && <Spinner />}
                {t('noctur.core.use')}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="noctur-chip acc">{newest}</span>
            <Button
              size="sm"
              disabled={!!busy}
              onClick={() => run('download', downloadCore, t('noctur.core.downloaded', { version: newest }))}
            >
              {busy === 'download' ? <Spinner /> : <Download className="size-4" />}
              {t('noctur.core.download')}
            </Button>
          </div>
        )}
      </SettingItem>
      {state.installed
        .filter((v) => v !== newest || state.active === v)
        .map((v) => (
          <SettingItem key={v} title={v}>
            <div className="flex items-center gap-2">
              {state.active !== v && (
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(`use-${v}`, () => useDownloadedCore(v))}>
                  {t('noctur.core.use')}
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(`rm-${v}`, () => removeCore(v))}>
                {busy === `rm-${v}` && <Spinner />}
                {t('noctur.core.remove')}
              </Button>
            </div>
          </SettingItem>
        ))}
      <div className="noctur-row-note">{t('noctur.core.note')}</div>
    </SettingCard>
  )
}

export default CorePanel
