import { ANIMAL_PHOTO_ENTITY } from '@/core/db/schema-statements'
import { isPhotoFileName } from '@/core/photos/photo-storage'
import { errorSummary } from '@/shared/utils/error-summary'
import type { SyncOutboxEntry } from '../repository/sync-outbox.repository'
import { PHOTO_CLOUD_GRACE_MS } from './cloud-photo'
import type { PhotoDeletePort } from './photo-delete-port'
import type { CloudPhotoObject, PhotoListPort } from './photo-list-port'
import { remotePages } from './remote-pages'
import type { SyncCycleOutbox } from './sync-cycle'
import { syncField, type SyncableTable } from './syncable-table'

export const MAX_SWEEP_DELETIONS = 20
export const CLOUD_PHOTO_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000
const CLOUD_PAGE_SIZE = 500

/** Heure du téléphone du dernier passage complet, gardée d'un lancement à l'autre. */
export interface CloudPhotoSweepMemory {
  read(): string | null
  write(at: string): void
}

export interface CloudPhotoSweepDependencies {
  outbox: Pick<SyncCycleOutbox, 'listPending' | 'isEnabled'>
  cloudAnimals: Pick<SyncableTable, 'pullPage'>
  /** Photos de toute ligne d'animal du téléphone, supprimé compris. */
  localKeptPhotos: () => Promise<string[]>
  objects: PhotoListPort
  deletes: PhotoDeletePort
  isEligible: () => boolean
  isAccountCurrent: (userId: string) => boolean
  lastSweep: CloudPhotoSweepMemory
  /** L'horloge du téléphone, pour l'espacement des passages seulement ; `new Date()` par défaut. */
  now?: () => Date
}

export interface CloudPhotoSweep {
  /** Efface du dossier cloud du compte les photos orphelines de plus de 7 jours. Ne lève pas. */
  sweep(userId: string): Promise<void>
}

interface CloudPhoto {
  name: string
  writtenAt: number
}

const isAnimalEntry = ({ entity }: Pick<SyncOutboxEntry, 'entity'>) => entity === 'animal'

function lastServerWrite({ name, createdAt, updatedAt }: CloudPhotoObject): CloudPhoto | null {
  if (createdAt === null || updatedAt === null) return null
  const writtenAt = Math.max(Date.parse(createdAt), Date.parse(updatedAt))
  return Number.isNaN(writtenAt) ? null : { name, writtenAt }
}

export function createCloudPhotoSweep(deps: CloudPhotoSweepDependencies): CloudPhotoSweep {
  const now = deps.now ?? (() => new Date())
  const sweptAccounts = new Set<string>()

  const mayRun = (userId: string) => deps.isEligible() && deps.isAccountCurrent(userId)

  function isDue(): boolean {
    const last = deps.lastSweep.read()
    if (last === null) return true
    const elapsed = now().getTime() - Date.parse(last)
    return !(elapsed >= 0 && elapsed < CLOUD_PHOTO_SWEEP_INTERVAL_MS)
  }

  /** `null` tant qu'une fiche d'animal attend d'être envoyée : celle du cloud est peut-être en retard. */
  async function findOrphans(userId: string): Promise<string[] | null> {
    const pending = await deps.outbox.listPending()
    if (pending.some(isAnimalEntry)) return null
    const kept = new Set(
      pending
        .filter(({ entity }) => entity === ANIMAL_PHOTO_ENTITY)
        .map(({ entityId }) => entityId),
    )
    for (const name of await deps.localKeptPhotos()) kept.add(name)

    // Le serveur n'a écrit aucune de ses dates après son propre « maintenant » : l'âge ne surestime jamais.
    let serverNow = Number.NEGATIVE_INFINITY
    for await (const page of remotePages(deps.cloudAnimals, userId, CLOUD_PAGE_SIZE)) {
      for (const row of page.rows) {
        const photoPath = syncField(row, 'photo_path')
        if (typeof photoPath === 'string') kept.add(photoPath)
      }
      for (const stamp of page.stamps) {
        const at = Date.parse(stamp)
        if (!Number.isNaN(at)) serverNow = Math.max(serverNow, at)
      }
    }
    const photos = (await deps.objects.list(userId)).flatMap((object) => {
      const photo = lastServerWrite(object)
      return photo === null ? [] : [photo]
    })
    for (const { writtenAt } of photos) serverNow = Math.max(serverNow, writtenAt)

    return photos
      .filter(
        ({ name, writtenAt }) =>
          isPhotoFileName(name) && !kept.has(name) && serverNow - writtenAt >= PHOTO_CLOUD_GRACE_MS,
      )
      .toSorted((a, b) => a.writtenAt - b.writtenAt)
      .map(({ name }) => name)
  }

  async function deleteOrphans(userId: string, orphans: string[]): Promise<void> {
    for (const name of orphans.slice(0, MAX_SWEEP_DELETIONS)) {
      if (!mayRun(userId)) return
      try {
        await deps.deletes.delete(userId, name)
      } catch (cause) {
        console.warn('Photo du cloud non effacée par le ménage :', errorSummary(cause))
        return
      }
    }
  }

  return {
    async sweep(userId) {
      if (!mayRun(userId) || sweptAccounts.has(userId) || !isDue()) return
      sweptAccounts.add(userId)
      try {
        if (!(await deps.outbox.isEnabled())) return
        const orphans = await findOrphans(userId)
        if (orphans === null) return
        if ((await deps.outbox.listPending()).some(isAnimalEntry)) return
        deps.lastSweep.write(now().toISOString())
        await deleteOrphans(userId, orphans)
      } catch (cause) {
        console.warn('Ménage des photos du cloud impossible :', errorSummary(cause))
      }
    },
  }
}
