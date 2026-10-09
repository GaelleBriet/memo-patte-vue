import { describe, expect, it, vi } from 'vitest'

import {
  createPdfExportService,
  type PdfExportDependencies,
  type PdfExportRequest,
} from '../service/pdf-export.service'
import type { DeliveryOutcome } from '../service/export-delivery.service'
import { EXPORT_FIXTURE, LUNA_ID, MILO_ID } from './export-fixture'

const EXPORTED_AT = new Date('2026-09-15T10:30:00')

function request(
  animalIds: string[],
  fileName = 'carnet-milo-20260915-1030.pdf',
): PdfExportRequest {
  return { animalIds, fileName, exportedAt: EXPORTED_AT }
}

function setup(overrides: Partial<PdfExportDependencies> = {}) {
  const deliver = vi.fn<PdfExportDependencies['deliver']>(async () => 'shared')
  const render = vi.fn<PdfExportDependencies['render']>(() => new Uint8Array([1, 2, 3]))
  const loadPhoto = vi.fn<PdfExportDependencies['loadPhoto']>(async () => null)
  const service = createPdfExportService({
    collect: async () => EXPORT_FIXTURE,
    render,
    loadPhoto,
    deliver,
    appVersion: '0.1.24',
    ...overrides,
  })
  return { service, deliver, render, loadPhoto }
}

describe('pdf-export.service', () => {
  it('renvoie « not-found » sans rien remettre quand aucun animal demandé n’existe', async () => {
    const { service, deliver, render } = setup()

    await expect(service.exportCarnetPdf(request(['introuvable']), 'save')).resolves.toBe(
      'not-found',
    )
    await expect(service.exportCarnetPdf(request([]), 'save')).resolves.toBe('not-found')
    expect(render).not.toHaveBeenCalled()
    expect(deliver).not.toHaveBeenCalled()
  })

  it("construit le contenu de l'animal demandé, daté du jour de l'export, et le remet sous le nom donné", async () => {
    const { service, deliver, render, loadPhoto } = setup()

    await expect(service.exportCarnetPdf(request([MILO_ID]), 'share')).resolves.toBe('shared')

    const [[part], appVersion] = render.mock.calls[0]!
    expect(part!.content.animal.name).toBe('Milo')
    expect(part!.content.generatedOn).toBe('2026-09-15')
    expect(part!.photoDataUrl).toBeNull()
    expect(appVersion).toBe('0.1.24')
    expect(loadPhoto).not.toHaveBeenCalled()

    const [file, mode] = deliver.mock.calls[0]!
    expect(file.name).toBe('carnet-milo-20260915-1030.pdf')
    expect(file.content).toEqual(new Uint8Array([1, 2, 3]))
    expect(mode).toBe('share')
  })

  it('met tous les animaux demandés dans un seul PDF, une partie par animal, dans l’ordre donné', async () => {
    const loadPhoto = vi.fn<PdfExportDependencies['loadPhoto']>(
      async () => 'data:image/jpeg;base64,abc',
    )
    const { service, render, deliver } = setup({ loadPhoto })

    await service.exportCarnetPdf(
      request([MILO_ID, LUNA_ID], 'carnet-memopatte-20260915-1030.pdf'),
      'save',
    )

    expect(render).toHaveBeenCalledOnce()
    const [parts] = render.mock.calls[0]!
    expect(parts.map(({ content }) => content.animal.name)).toEqual(['Milo', 'Luna'])
    expect(parts.map(({ photoDataUrl }) => photoDataUrl)).toEqual([
      null,
      'data:image/jpeg;base64,abc',
    ])
    expect(loadPhoto).toHaveBeenCalledExactlyOnceWith('0f6c1c9e-5d6b-4b43-9a57-2f1d8b0c7a11.jpg')
    expect(deliver).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: 'carnet-memopatte-20260915-1030.pdf' }),
      'save',
    )
  })

  it('laisse de côté un animal disparu depuis l’ouverture de la feuille', async () => {
    const { service, render } = setup()

    await service.exportCarnetPdf(request(['introuvable', LUNA_ID]), 'save')

    expect(render.mock.calls[0]![0].map(({ content }) => content.animal.name)).toEqual(['Luna'])
  })

  it('continue sans photo si elle est illisible', async () => {
    const { service, render } = setup({ loadPhoto: async () => null })

    await expect(service.exportCarnetPdf(request([LUNA_ID]), 'share')).resolves.toBe('shared')

    expect(render.mock.calls[0]![0][0]!.photoDataUrl).toBeNull()
  })

  it('transmet l’issue de la remise', async () => {
    const saved = {
      status: 'saved',
      file: { uri: 'file:///carnet-milo-20260915-1030.pdf', mimeType: 'application/pdf' },
    } as const
    await expect(
      setup({ deliver: async () => 'cancelled' as DeliveryOutcome }).service.exportCarnetPdf(
        request([MILO_ID]),
        'share',
      ),
    ).resolves.toBe('cancelled')
    await expect(
      setup({ deliver: async () => saved }).service.exportCarnetPdf(request([MILO_ID]), 'save'),
    ).resolves.toBe(saved)
  })

  it('lève si la base ne répond pas, sans rien remettre', async () => {
    const { service, deliver } = setup({
      collect: async () => {
        throw new Error('base fermée')
      },
    })

    await expect(service.exportCarnetPdf(request([MILO_ID]), 'save')).rejects.toThrow('base fermée')
    expect(deliver).not.toHaveBeenCalled()
  })
})
