import { describe, expect, it, vi } from 'vitest'

import { createPdfExportService, type PdfExportDependencies } from '../pdf-export.service'
import type { DeliveryOutcome } from '../export-delivery'
import type { CarnetPdfContent } from '../pdf-content'
import { EXPORT_FIXTURE, MILO_ID } from './export-fixture'

const NOW = new Date('2026-09-15T10:30:00')

function setup(overrides: Partial<PdfExportDependencies> = {}) {
  const deliver = vi.fn<PdfExportDependencies['deliver']>(async () => 'shared')
  const render = vi.fn<PdfExportDependencies['render']>(() => new Uint8Array([1, 2, 3]))
  const service = createPdfExportService({
    collect: async () => EXPORT_FIXTURE,
    render,
    deliver,
    now: () => NOW,
    appVersion: '0.1.24',
    ...overrides,
  })
  return { service, deliver, render }
}

describe('pdf-export.service', () => {
  it('renvoie « not-found » sans rien remettre pour un animal inconnu', async () => {
    const { service, deliver, render } = setup()

    await expect(service.exportAnimalCarnetPdf('introuvable')).resolves.toBe('not-found')
    expect(render).not.toHaveBeenCalled()
    expect(deliver).not.toHaveBeenCalled()
  })

  it("construit le contenu de l'animal demandé et le remet en PDF nommé", async () => {
    const { service, deliver, render } = setup()

    await expect(service.exportAnimalCarnetPdf(MILO_ID)).resolves.toBe('shared')

    const [content, appVersion] = render.mock.calls[0]! as [CarnetPdfContent, string]
    expect(content.animal.name).toBe('Milo')
    expect(content.generatedOn).toBe('2026-09-15')
    expect(appVersion).toBe('0.1.24')

    const [file] = deliver.mock.calls[0]! as [{ name: string; content: Uint8Array }]
    expect(file.name).toBe('memopatte-milo-2026-09-15.pdf')
    expect(file.content).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('transmet l’issue du partage', async () => {
    const { service } = setup({ deliver: async () => 'cancelled' as DeliveryOutcome })

    await expect(service.exportAnimalCarnetPdf(MILO_ID)).resolves.toBe('cancelled')
  })

  it('lève si la base ne répond pas, sans rien remettre', async () => {
    const { service, deliver } = setup({
      collect: async () => {
        throw new Error('base fermée')
      },
    })

    await expect(service.exportAnimalCarnetPdf(MILO_ID)).rejects.toThrow('base fermée')
    expect(deliver).not.toHaveBeenCalled()
  })
})
