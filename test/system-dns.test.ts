// While TUN is on, every network service's DNS points into the tunnel, so lookups reach mihomo
// instead of the local network's server; afterwards each service gets its own original back. Runs
// the real steps against a fake networksetup that keeps each service's DNS as macOS does.
import { describe, expect, it } from 'vitest'
import { DnsDeps, pointDnsIntoTunnel, restoreDns } from '../src/main/noctur/system-dns'

type Config = Awaited<ReturnType<DnsDeps['getConfig']>>

function fakeMac(config: Config): { deps: DnsDeps; dns: Record<string, string>; config: Config } {
  const services = [
    { name: 'USB 10/100/1000 LAN', device: 'en7', enabled: true },
    { name: 'Wi-Fi', device: 'en0', enabled: true },
    { name: 'Old Ethernet', device: 'en5', enabled: false },
    { name: 'Shadowrocket', device: '', enabled: true }
  ]
  const dns: Record<string, string> = {
    'USB 10/100/1000 LAN': '10.0.0.53 10.0.0.54',
    'Wi-Fi': 'Empty',
    'Old Ethernet': 'Empty',
    Shadowrocket: 'Empty'
  }
  const state = { config }
  const deps: DnsDeps = {
    run: async (args) => {
      if (args[0] === '-listnetworkserviceorder') {
        return services
          .map(
            (s, i) =>
              `(${s.enabled ? i + 1 : '*'}) ${s.name}\n(Hardware Port: ${s.name}, Device: ${s.device})`
          )
          .join('\n')
      }
      if (args[0] === '-getdnsservers') {
        const v = dns[args[1]]
        return v === 'Empty'
          ? `There aren't any DNS Servers set on ${args[1]}.\n`
          : `${v.split(' ').join('\n')}\n`
      }
      if (args[0] === '-setdnsservers') {
        dns[args[1]] = args.slice(2).join(' ')
        return ''
      }
      throw new Error(`unexpected ${args}`)
    },
    setViaService: async () => {},
    getConfig: async () => ({ ...state.config }),
    patchConfig: async (patch) => {
      const next = { ...state.config, ...patch }
      for (const [k, v] of Object.entries(patch))
        if (v === undefined) delete (next as Record<string, unknown>)[k]
      state.config = next
    }
  }
  return {
    deps,
    dns,
    get config() {
      return state.config
    }
  }
}

describe('system DNS while TUN is on', () => {
  it('points every network service into the tunnel when the setting is unset', async () => {
    const mac = fakeMac({})
    await pointDnsIntoTunnel(mac.deps)
    expect(mac.dns['Wi-Fi']).toBe('1.1.1.1 77.88.8.8')
    expect(mac.dns['USB 10/100/1000 LAN']).toBe('1.1.1.1 77.88.8.8')
    // A disabled service and a VPN app's entry stay as they are.
    expect(mac.dns['Old Ethernet']).toBe('Empty')
    expect(mac.dns.Shadowrocket).toBe('Empty')
  })

  it('is not stopped by an original upstream recorded without changing anything', async () => {
    const mac = fakeMac({ originDNS: 'Empty' })
    await pointDnsIntoTunnel(mac.deps)
    expect(mac.dns['Wi-Fi']).toBe('1.1.1.1 77.88.8.8')
  })

  it('gives every service its own original back, also after a restart while connected', async () => {
    const mac = fakeMac({})
    await pointDnsIntoTunnel(mac.deps)
    await pointDnsIntoTunnel(mac.deps)
    // A new start reads only what was saved.
    const after = fakeMac(mac.config)
    Object.assign(after.dns, mac.dns)
    await restoreDns(after.deps)
    expect(after.dns['Wi-Fi']).toBe('Empty')
    expect(after.dns['USB 10/100/1000 LAN']).toBe('10.0.0.53 10.0.0.54')
    expect(after.config.originDNSByService).toBeUndefined()
  })
})
