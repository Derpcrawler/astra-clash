import { getAppConfig } from '../config'
import { version } from '../../../package.json'

export async function getUserAgent(): Promise<string> {
  const { userAgent } = await getAppConfig()
  if (userAgent) {
    return userAgent
  }

  // Starts with 'mihomo': Remnawave picks the config format from the start of the User-Agent and
  // sends base64 links, which Clash cannot read, to names it does not know.
  return `mihomo astra-clash/${version}`
}
