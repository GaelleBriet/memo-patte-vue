import i18n from '@/core/i18n'
import { readPlusAccount } from '@/features/auth/logic/plus-account-storage'
import { authRepository } from '@/features/auth/repository/auth.repository'
import { showToast } from '@/shared/utils/toast'

const SESSION_RESET_TOAST_MS = 6_000

export function installSessionResetNotice(
  listen: (listener: () => void) => void = (listener) =>
    authRepository.onSessionUnreadable(listener),
  t: (key: string) => string = (key) => i18n.global.t(key),
  hasAccount: () => boolean = () => readPlusAccount() !== null,
): void {
  listen(() => {
    if (!hasAccount()) return
    showToast(t('auth.session.reset'), { tone: 'info', durationMs: SESSION_RESET_TOAST_MS })
  })
}
