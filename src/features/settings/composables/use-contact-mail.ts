import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  CONTACT_ADDRESS,
  contactMailBody,
  contactMailUrl,
  type ContactTopic,
} from '../logic/contact-mail'
import { androidVersion, openInExternalApp } from '@/core/device/system-apps'
import { showToast } from '@/shared/utils/toast'

export function useContactMail() {
  const { t } = useI18n()
  const unsentTopic = ref<ContactTopic | null>(null)

  async function write(topic: ContactTopic): Promise<void> {
    const android = await androidVersion()
    const details = [
      t('settings.help.mail.appVersion', { version: import.meta.env.VITE_APP_VERSION }),
    ]
    if (android) details.push(t('settings.help.mail.androidVersion', { version: android }))
    const url = contactMailUrl({
      subject:
        topic === 'question'
          ? t('settings.help.mail.subject.question')
          : t('settings.help.mail.subject.suggestion'),
      body: contactMailBody(details),
    })
    if (!(await openInExternalApp(url))) unsentTopic.value = topic
  }

  async function copyAddress(): Promise<void> {
    try {
      await navigator.clipboard.writeText(CONTACT_ADDRESS)
      showToast(t('settings.help.noMailApp.copied'))
    } catch {
      showToast(t('settings.help.noMailApp.copyFailed'), { tone: 'error' })
    }
  }

  return { address: CONTACT_ADDRESS, unsentTopic, write, copyAddress }
}
