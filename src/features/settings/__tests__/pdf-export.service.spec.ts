import { describe, expect, it, vi } from 'vitest'

import { createPdfExportService, type PdfExportDependencies } from '../service/pdf-export.service'
import type { DeliveryOutcome } from '../logic/export-delivery'
import type { CarnetPdfContent } from '../logic/pdf-content'
import { EXPORT_FIXTURE, LUNA_ID, MILO_ID } from './export-fixture'

const NOW = new Date('2026-09-15T10:30:00')

function setup(overrides: Partial<PdfExportDependencies> = {}) {
  const deliver = vi.fn<PdfExportDependencies['deliver']>(async () => 'shared')
  const render = vi.fn<PdfExportDependencies['render']>(() => new Uint8Array([1, 2, 3]))
  const loadPhoto = vi.fn<PdfExportDependencies['loadPhoto']>(async () => null)
  const service = createPdfExportService({
    collect: async () => EXPORT_FIXTURE,
    render,
    loadPhoto,
    deliver,
    now: () => NOW,
    appVersion: '0.1.24',
    ...overrides,
  })
  return { service, deliver, render, loadPhoto }
}

describe('pdf-export.service', () => {
  it('renvoie « not-found » sans rien remettre pour un animal inconnu', async () => {
    const { service, deliver, render } = setup()

    await expect(service.exportAnimalCarnetPdf('introuvable')).resolves.toBe('not-found')
    expect(render).not.toHaveBeenCalled()
    expect(deliver).not.toHaveBeenCalled()
  })

  it("construit le contenu de l'animal demandé et le remet en PDF nommé", async () => {
    const { service, deliver, render, loadPhoto } = setup()

    await expect(service.exportAnimalCarnetPdf(MILO_ID)).resolves.toBe('shared')

    const [content, appVersion, photoDataUrl] = render.mock.calls[0]! as [
      CarnetPdfContent,
      string,
      string | null,
    ]
    expect(content.animal.name).toBe('Milo')
    expect(content.generatedOn).toBe('2026-09-15')
    expect(appVersion).toBe('0.1.24')
    expect(photoDataUrl).toBeNull()
    expect(loadPhoto).not.toHaveBeenCalled()

    const [file] = deliver.mock.calls[0]! as [{ name: string; content: Uint8Array }]
    expect(file.name).toBe('memopatte-milo-2026-09-15.pdf')
    expect(file.content).toEqual(new Uint8Array([1, 2, 3]))
  })

  it("charge la photo de l'animal quand il en a une et la transmet au rendu", async () => {
    const loadPhoto = vi.fn<PdfExportDependencies['loadPhoto']>(
      async () => 'data:image/jpeg;base64,abc',
    )
    const { service, render } = setup({ loadPhoto })

    await service.exportAnimalCarnetPdf(LUNA_ID)

    expect(loadPhoto).toHaveBeenCalledWith('0f6c1c9e-5d6b-4b43-9a57-2f1d8b0c7a11.jpg')
    const [, , photoDataUrl] = render.mock.calls[0]! as [CarnetPdfContent, string, string | null]
    expect(photoDataUrl).toBe('data:image/jpeg;base64,abc')
  })

  it('continue sans photo si elle est illisible', async () => {
    const loadPhoto = vi.fn<PdfExportDependencies['loadPhoto']>(async () => null)
    const { service, render } = setup({ loadPhoto })

    await expect(service.exportAnimalCarnetPdf(LUNA_ID)).resolves.toBe('shared')

    const [, , photoDataUrl] = render.mock.calls[0]! as [CarnetPdfContent, string, string | null]
    expect(photoDataUrl).toBeNull()
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
