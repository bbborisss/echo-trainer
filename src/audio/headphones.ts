import { useCallback, useEffect, useState } from 'react'

/**
 * Best-effort headphone detection for Shadow mode. Shadowing plays the
 * reference clip while the mic records — without headphones the mic would
 * pick up the original and poison scoring, so the mode is gated on this.
 *
 * Heuristic: device labels from enumerateDevices() matched against known
 * headphone/headset names. Labels are only populated once the site has (or
 * had) mic permission — `requestPermission: true` grabs a throwaway audio
 * stream to unlock them (only used from an explicit user gesture).
 */

const HEADPHONE_RE =
  /headphone|headset|earphone|ear ?bud|airpod|earpod|buds|arctis|hyperx|wh-?10|wf-?10|quietcomfort|momentum/i

function matches(devices: MediaDeviceInfo[]): boolean {
  return devices.some(
    (d) => (d.kind === 'audiooutput' || d.kind === 'audioinput') && HEADPHONE_RE.test(d.label),
  )
}

export async function detectHeadphones(opts?: { requestPermission?: boolean }): Promise<boolean> {
  if (!navigator.mediaDevices?.enumerateDevices) return false
  try {
    let devices = await navigator.mediaDevices.enumerateDevices()
    const anyLabels = devices.some((d) => d.label !== '')
    if (!anyLabels && opts?.requestPermission) {
      // No permission yet → labels are blank. Borrow a stream to reveal them.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      devices = await navigator.mediaDevices.enumerateDevices()
    }
    return matches(devices)
  } catch {
    return false
  }
}

/**
 * Live headphone status. Passive on mount (no permission prompt); `verify()`
 * re-checks with a permission request — call it from a user gesture (e.g.
 * tapping the Shadow toggle). Tracks plug/unplug via `devicechange`.
 */
export function useHeadphones() {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let alive = true
    const check = () => {
      void detectHeadphones().then((ok) => {
        if (alive) setConnected(ok)
      })
    }
    check()
    navigator.mediaDevices?.addEventListener?.('devicechange', check)
    return () => {
      alive = false
      navigator.mediaDevices?.removeEventListener?.('devicechange', check)
    }
  }, [])

  const verify = useCallback(async (): Promise<boolean> => {
    const ok = await detectHeadphones({ requestPermission: true })
    setConnected(ok)
    return ok
  }, [])

  return { connected, verify }
}
