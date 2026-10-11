import React from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from 'next-themes'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@renderer/components/ui/dialog'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { LookChoices } from './look-preview'
import Eclipse from './eclipse'

// First launch, and the first start after the update from Astra Clash: choose the look, Noctur or
// Calm. It opens in the app's theme (the system's light or dark by default). A choice applies at
// once, so the window behind shows it; Continue saves that it was chosen and the tour can start.
// The picker cannot be dismissed without Continue: Noctur stays chosen unless Calm is picked.

const LookPicker: React.FC = () => {
  const { t } = useTranslation()
  const { appConfig, patchAppConfig } = useAppConfig()
  const { resolvedTheme } = useTheme()
  const look = appConfig?.look ?? 'noctur'
  const light = resolvedTheme === 'light'
  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        className="noctur-look-picker bg-popover/90 gap-6 p-7 sm:max-w-[680px]"
      >
        <div className="noctur-look-head">
          <Eclipse className="noctur-look-mark" moon={light ? 'blue' : 'earthshine'} light={light} />
          <DialogTitle>{t('noctur.look.welcome')}</DialogTitle>
          <DialogDescription>{t('noctur.look.pick')}</DialogDescription>
        </div>
        <LookChoices
          value={look}
          light={light}
          onChange={(v) => patchAppConfig({ look: v })}
        />
        <div className="noctur-look-foot">
          <button type="button" className="noctur-connect" onClick={() => patchAppConfig({ lookChosen: true })}>
            {t('noctur.look.continue')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default LookPicker
