import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ExportCopyChoice from '../components/ExportCopyChoice.vue'
import { provideExportCopy } from '@/core/export-copy/export-copy-port'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

afterEach(() => provideExportCopy(null))

describe('ExportCopyChoice', () => {
  it('lance l’export d’une copie au toucher', async () => {
    const exportCopy = vi.fn<() => Promise<void>>(async () => {})
    provideExportCopy(() => ({ isPreparing: ref(false), exportCopy }))
    const wrapper = mount(ExportCopyChoice, { global: { plugins: [vuetify, i18n] } })

    expect(wrapper.text()).toBe('Exporter une copie')
    await wrapper.get('button').trigger('click')

    expect(exportCopy).toHaveBeenCalledOnce()
  })
})
