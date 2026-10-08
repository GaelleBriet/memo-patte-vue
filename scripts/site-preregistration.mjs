const PLAY_URL = /^https:\/\/play\.google\.com\/store\/apps\/details\?id=[\w.]+$/

const TEXTS = {
  fr: {
    soon: 'Bientôt\\s+sur\\s+Google\\s+Play',
    label: 'Me préinscrire sur Google Play',
    note: 'Google Play t’envoie une notification le jour de la sortie. Rien à payer, rien à installer d’ici là.',
    answerId: 'reponse-sortie',
    answer:
      'La date n’est pas encore fixée. La préinscription est ouverte&nbsp;: préinscris-toi sur Google Play pour recevoir une notification le jour de la sortie.',
  },
  en: {
    soon: 'Coming\\s+soon\\s+to\\s+Google\\s+Play',
    label: 'Pre-register on Google Play',
    note: 'Google Play will notify you on launch day. Nothing to pay, nothing to install until then.',
    answerId: 'answer-release',
    answer:
      'The date isn’t set yet. Pre-registration is open: pre-register on Google Play to get a notification on launch day.',
  },
}

export function openPreregistration(html, lang, playUrl) {
  if (!PLAY_URL.test(playUrl)) throw new Error(`Adresse Google Play invalide : ${playUrl}`)
  const texts = TEXTS[lang]
  const badge = new RegExp(
    `<span class="(chip[^"]*)"\\s*>\\s*<span class="symbol symbol-schedule" aria-hidden="true"><\\/span\\s*>\\s*${texts.soon}\\s*<\\/span\\s*>`,
    'g',
  )
  return html
    .replace(
      badge,
      (_, classes) =>
        `<a class="${classes}" href="${playUrl}"><span class="symbol symbol-notifications-active" aria-hidden="true"></span>${texts.label}</a>`,
    )
    .replace(/(<p class="play-facts">[\s\S]*?<\/p>)/g, `$1\n<p class="play-note">${texts.note}</p>`)
    .replace(new RegExp(`(<p id="${texts.answerId}">)[\\s\\S]*?(<\\/p>)`), `$1${texts.answer}$2`)
    .replace(`/img/og-${lang}.png`, `/img/og-preinscription-${lang}.png`)
}
