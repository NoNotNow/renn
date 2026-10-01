import type { ShippedGlobalBehaviorLibraryBundle } from '@/globalPipeline/shippedGlobalBehaviorLibraryTypes'

/** Browser: load shipped Organize → Global defaults from public/global/. */
export async function fetchShippedGlobalBehaviorLibrary(): Promise<ShippedGlobalBehaviorLibraryBundle | null> {
  const base = import.meta.env.BASE_URL ?? '/'
  const url = `${base.endsWith('/') ? base : `${base}/`}global/shipped-global-behavior-library.json`
  try {
    const res = await fetch(url, { cache: 'no-cache' })
    if (!res.ok) return null
    return (await res.json()) as ShippedGlobalBehaviorLibraryBundle
  } catch {
    return null
  }
}
