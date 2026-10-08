export const OLD_ANCHORS = {
  '/aide/': {
    exporter: '/aide/exporter/',
    'sauvegarde-android': '/aide/sauvegarde-android/',
    plus: '/aide/plus/',
    'nouveau-telephone': '/aide/nouveau-telephone/',
    effacer: '/aide/effacer/',
    'ne-plus-suivre': '/aide/ne-plus-suivre/',
    'rappels-en-retard': '/aide/rappels-en-retard/',
    rappels: '/aide/rappels/',
    'rappels-notifications': '/aide/rappels/#rappels-notifications',
    'rappels-batterie': '/aide/rappels/#rappels-batterie',
    'rappels-precis': '/aide/rappels/#rappels-precis',
    'rappels-limites': '/aide/rappels/#rappels-limites',
  },
  '/en/help/': {
    export: '/en/help/export/',
    'android-backup': '/en/help/android-backup/',
    plus: '/en/help/plus/',
    'new-phone': '/en/help/new-phone/',
    erase: '/en/help/erase/',
    'stop-following': '/en/help/stop-following/',
    'late-reminders': '/en/help/late-reminders/',
    reminders: '/en/help/reminders/',
    'reminders-notifications': '/en/help/reminders/#reminders-notifications',
    'reminders-battery': '/en/help/reminders/#reminders-battery',
    'reminders-exact': '/en/help/reminders/#reminders-exact',
    'reminders-limits': '/en/help/reminders/#reminders-limits',
  },
}

export function redirectTarget(pathname, hash) {
  const anchors = OLD_ANCHORS[pathname]
  const anchor = decodeURIComponent(hash.replace(/^#/, ''))
  return (anchors && Object.hasOwn(anchors, anchor) && anchors[anchor]) || null
}

function followOldAnchor() {
  const target = redirectTarget(location.pathname, location.hash)
  if (target) location.replace(target)
}

if (typeof location !== 'undefined') {
  followOldAnchor()
  addEventListener('hashchange', followOldAnchor)
}
