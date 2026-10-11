import { getAppConfig } from '../config'
import { version } from '../../../package.json'

// Panels pick the config format from the User-Agent. Remnawave sends mihomo YAML to names it lists
// in its Mihomo response rule and base64 links, which Clash cannot read, to names it does not know.
// Noctur asks as "noctur" first, so a panel can list it by name, then as the names panels already
// know: "mihomo" and "clash.meta" (config/profile.ts tries them in this order).
export type SubscriptionAgent = 'noctur' | 'mihomo' | 'clashMeta'

export const SUBSCRIPTION_AGENTS: SubscriptionAgent[] = ['noctur', 'mihomo', 'clashMeta']

export function agentHeader(agent: SubscriptionAgent): string {
  switch (agent) {
    case 'noctur':
      return `noctur/${version}`
    case 'mihomo':
      return `mihomo noctur/${version}`
    case 'clashMeta':
      return `clash.meta noctur/${version}`
  }
}

/** The user's own User-Agent setting, or the first one Noctur tries. */
export async function getUserAgent(): Promise<string> {
  const { userAgent } = await getAppConfig()
  if (userAgent) {
    return userAgent
  }
  return agentHeader(SUBSCRIPTION_AGENTS[0])
}
