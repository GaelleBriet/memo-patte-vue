import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ImportRefusedError,
  type DataImportService,
  type ImportLosses,
  type ImportMode,
} from '../service/data-import.service'
import { useDataImport } from '../composables/use-data-import'
import exportV2 from './fixtures/export-v2-0.1.48.json?raw'
import { IMPORT_FILE, importFixtureJson } from './import-fixture'

const hasLocalData = vi.fn<() => Promise<boolean>>()
const importData = vi.fn<DataImportService['importData']>()
const onImported = vi.fn<(lost: ImportLosses | null) => void>()

function fichier(content: string): File {
  return new File([content], 'memopatte-export-2026-09-15.json', { type: 'application/json' })
}

function setup() {
  return useDataImport({ hasLocalData, importData }, onImported)
}

beforeEach(() => {
  hasLocalData.mockReset().mockResolvedValue(true)
  importData.mockReset().mockResolvedValue(undefined)
  onImported.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('useDataImport', () => {
  it('importe directement dans une base vide, sans rien demander', async () => {
    hasLocalData.mockResolvedValue(false)
    const flow = setup()

    await flow.selectFile(fichier(importFixtureJson()))

    expect(importData).toHaveBeenCalledWith(IMPORT_FILE, 'replace')
    expect(onImported).toHaveBeenCalledOnce()
    expect(flow.step.value).toBe('idle')
  })

  it('ne signale aucune perte pour un export au format courant', async () => {
    hasLocalData.mockResolvedValue(false)

    await setup().selectFile(fichier(importFixtureJson()))

    expect(onImported).toHaveBeenCalledWith(null)
  })

  it('importe un ancien export et dit ce que la conversion n’a pas pu reprendre', async () => {
    const document = JSON.parse(exportV2) as Record<string, Record<string, unknown>[]>
    document.treatmentDoses!.push({
      ...document.treatmentDoses![0],
      id: '11111111-0000-4000-8000-000000000001',
      treatmentId: '99999999-9999-4999-8999-999999999999',
    })
    const flow = setup()
    await flow.selectFile(fichier(JSON.stringify(document)))

    await flow.choose('merge')

    expect(importData).toHaveBeenCalledWith(expect.objectContaining({ schemaVersion: 4 }), 'merge')
    expect(onImported).toHaveBeenCalledWith({ injections: 0, doses: 1, weightEntries: 0 })
  })

  it('demande de fusionner ou remplacer quand des données existent', async () => {
    const flow = setup()

    await flow.selectFile(fichier(importFixtureJson()))

    expect(flow.step.value).toBe('choice')
    expect(importData).not.toHaveBeenCalled()
  })

  it('fusionne sans confirmation', async () => {
    const flow = setup()
    await flow.selectFile(fichier(importFixtureJson()))

    await flow.choose('merge')

    expect(importData).toHaveBeenCalledWith(IMPORT_FILE, 'merge')
    expect(onImported).toHaveBeenCalledOnce()
    expect(flow.step.value).toBe('idle')
  })

  it('ne remplace qu’après confirmation, et rien si on renonce', async () => {
    const flow = setup()
    await flow.selectFile(fichier(importFixtureJson()))

    await flow.choose('replace')
    expect(flow.step.value).toBe('confirm')
    expect(importData).not.toHaveBeenCalled()

    flow.cancelReplace()
    expect(flow.step.value).toBe('choice')

    await flow.choose('replace')
    await flow.confirmReplace()
    expect(importData).toHaveBeenCalledWith(IMPORT_FILE, 'replace')
    expect(flow.step.value).toBe('idle')
  })

  it.each([
    ['invalid', 'pas du JSON'],
    ['newer', JSON.stringify({ schemaVersion: 99 })],
    ['invalid', JSON.stringify({ schemaVersion: 2, animals: [] })],
  ] as const)('signale un fichier refusé (%s) sans rien écrire', async (error, content) => {
    const flow = setup()

    await flow.selectFile(fichier(content))

    expect(flow.step.value).toBe('error')
    expect(flow.error.value).toBe(error)
    expect(hasLocalData).not.toHaveBeenCalled()
    expect(importData).not.toHaveBeenCalled()
  })

  it('refuse un fichier de plus de 10 Mo sans le lire', async () => {
    const text = vi.fn<() => Promise<string>>()
    const flow = setup()

    await flow.selectFile({ size: 10 * 1024 * 1024 + 1, text } as unknown as File)

    expect(text).not.toHaveBeenCalled()
    expect(flow.error.value).toBe('invalid')
  })

  it('reste occupé pendant tout un import direct et ignore un second fichier', async () => {
    hasLocalData.mockResolvedValue(false)
    let finish!: () => void
    importData.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)))
    const flow = setup()

    const pending = flow.selectFile(fichier(importFixtureJson()))
    expect(flow.isImporting.value).toBe(true)
    await flow.selectFile(fichier(importFixtureJson()))
    await vi.waitFor(() => expect(importData).toHaveBeenCalledOnce())
    finish()
    await pending

    expect(importData).toHaveBeenCalledOnce()
    expect(flow.isImporting.value).toBe(false)
  })

  it('signale un fichier qui déplace une entrée, sans le confondre avec une panne', async () => {
    importData.mockRejectedValue(new ImportRefusedError('reattached'))
    const flow = setup()
    await flow.selectFile(fichier(importFixtureJson()))

    await flow.choose('merge')

    expect(flow.step.value).toBe('error')
    expect(flow.error.value).toBe('reattached')
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('signale un échec d’écriture et ne prévient pas d’un import', async () => {
    importData.mockRejectedValue(new Error('disque plein'))
    const flow = setup()
    await flow.selectFile(fichier(importFixtureJson()))

    await flow.choose('merge')

    expect(flow.step.value).toBe('error')
    expect(flow.error.value).toBe('failed')
    expect(onImported).not.toHaveBeenCalled()
  })

  it('ne journalise que le type d’une erreur d’écriture, jamais son message, qui peut citer le fichier', async () => {
    importData.mockRejectedValue(new TypeError('UNIQUE constraint failed: Luna, 2019-03-02'))
    const flow = setup()
    await flow.selectFile(fichier(importFixtureJson()))

    await flow.choose('merge')

    expect(console.warn).toHaveBeenCalledExactlyOnceWith('Import impossible :', 'TypeError')
  })

  it('reste occupé pendant l’écriture et ignore un second choix', async () => {
    let finish!: () => void
    importData.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)))
    const flow = setup()
    await flow.selectFile(fichier(importFixtureJson()))

    const pending = flow.choose('merge')
    expect(flow.isImporting.value).toBe(true)
    await flow.choose('merge' as ImportMode)
    finish()
    await pending

    expect(importData).toHaveBeenCalledOnce()
    expect(flow.isImporting.value).toBe(false)
  })

  it('oublie le fichier en attente quand on ferme', async () => {
    const flow = setup()
    await flow.selectFile(fichier(importFixtureJson()))

    flow.close()
    await flow.choose('merge')

    expect(flow.step.value).toBe('idle')
    expect(importData).not.toHaveBeenCalled()
  })
})
