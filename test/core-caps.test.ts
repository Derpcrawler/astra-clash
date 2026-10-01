// Reading getcap output for the Linux core: both output formats of libcap count as granted, and
// capabilities that are only permitted (not effective), or missing one of the two, do not.
import { describe, expect, it } from 'vitest'
import { parseCoreCaps } from '../src/main/astra/core-caps'

const CORE = '/opt/Astra Clash/resources/sidecar/mihomo'

describe('parseCoreCaps', () => {
  it('accepts both getcap output formats', () => {
    expect(parseCoreCaps(`${CORE} cap_net_bind_service,cap_net_admin=ep\n`, CORE)).toBe(true)
    expect(parseCoreCaps(`${CORE} = cap_net_bind_service,cap_net_admin+ep\n`, CORE)).toBe(true)
  })

  it('rejects capabilities that are not effective or incomplete', () => {
    expect(parseCoreCaps(`${CORE} cap_net_bind_service,cap_net_admin=p\n`, CORE)).toBe(false)
    expect(parseCoreCaps(`${CORE} cap_net_admin=ep\n`, CORE)).toBe(false)
    expect(parseCoreCaps('', CORE)).toBe(false)
  })

  it('reads only the line for the core, after its path', () => {
    const other = '/home/u/cap_net_admin cap_net_bind_service/mihomo'
    expect(parseCoreCaps(`${other} cap_net_bind_service=ep\n`, other)).toBe(false)
    expect(parseCoreCaps(`/usr/bin/other cap_net_bind_service,cap_net_admin=ep\n`, CORE)).toBe(false)
  })
})
