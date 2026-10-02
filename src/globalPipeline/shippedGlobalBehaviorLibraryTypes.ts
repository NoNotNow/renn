import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'

/** Shipped defaults under public/global/ (Organize → Global). */
export type ShippedGlobalBehaviorLibraryBundle = {
  version: number
  checksum: string
  syncedAt?: string
  library: GlobalBehaviorLibrary
}

/** Registry / pipe ids authored in public/global (do not collide with user globals). */
export const SHIPPED_GLOBAL_TF_PREFIX = 'global_sd_'
export const SHIPPED_GLOBAL_PIPE_PREFIX = 'global_self_drive_'
/** Industry-style AV stack (nested pipes): stage and pipe ids share this prefix. */
export const SHIPPED_GLOBAL_AV_PREFIX = 'global_av_'

export function isShippedGlobalTransformerId(id: string): boolean {
  return id.startsWith(SHIPPED_GLOBAL_TF_PREFIX) || id.startsWith(SHIPPED_GLOBAL_AV_PREFIX)
}

export function isShippedGlobalPipeId(id: string): boolean {
  return id.startsWith(SHIPPED_GLOBAL_PIPE_PREFIX) || id.startsWith(SHIPPED_GLOBAL_AV_PREFIX)
}
