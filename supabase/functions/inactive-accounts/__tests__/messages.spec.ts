// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { CONTACT, SENDER, warningEmail } from '../messages'

const NBSP = ' '
const ended = { kind: 'plus-ended', accessEndedAt: '2026-11-15T14:00:00.000Z' } as const

describe('warningEmail', () => {
  it('vouvoie en français, depuis noreply, avec le contact cité', () => {
    const email = warningEmail({ email: 'sophie@exemple.test', locale: 'fr' }, ended, '2027-11-16')

    expect(email).toEqual({
      from: 'noreply@memopatte.app',
      to: 'sophie@exemple.test',
      subject: `Votre compte MémoPatte sera supprimé le 16${NBSP}novembre${NBSP}2027`,
      text:
        `Bonjour, votre accès MémoPatte Plus a pris fin le 15${NBSP}novembre${NBSP}2026. ` +
        "Comme l'annonce notre politique de confidentialité, un compte sans accès Plus pendant 12 mois est supprimé. " +
        `Le 16${NBSP}novembre${NBSP}2027, nous supprimerons votre compte, adresse e-mail comprise, ` +
        'votre sauvegarde dans le cloud et vos photos sauvegardées. ' +
        'Les données sur votre téléphone ne sont pas touchées. ' +
        "Pour garder votre compte et votre sauvegarde, reprenez MémoPatte Plus dans l'app avant cette date. " +
        'Vous pouvez aussi exporter vos données gratuitement depuis Paramètres. ' +
        `Une question, ou pour supprimer votre compte dès maintenant${NBSP}: contact@memopatte.app.`,
    })
  })

  it('écrit en anglais pour une inscription en anglais', () => {
    const email = warningEmail({ email: 'sam@exemple.test', locale: 'en' }, ended, '2027-11-16')

    expect(email).toEqual({
      from: 'noreply@memopatte.app',
      to: 'sam@exemple.test',
      subject: 'Your MémoPatte account will be deleted on November 16, 2027',
      text:
        'Hello, your MémoPatte Plus access ended on November 15, 2026. ' +
        'As our privacy policy states, an account without Plus access for 12 months is deleted. ' +
        'On November 16, 2027, we will delete your account, including your email address, ' +
        'your cloud backup and your backed-up photos. ' +
        'The data on your phone is not affected. ' +
        'To keep your account and your backup, resume MémoPatte Plus in the app before that date. ' +
        'You can also export your data for free from Settings. ' +
        'Questions, or to delete your account right now: contact@memopatte.app.',
    })
  })

  it('écrit en anglais quand la langue de l’inscription est inconnue', () => {
    const email = warningEmail({ email: 'sam@exemple.test', locale: null }, ended, '2027-11-16')

    expect(email?.subject).toBe('Your MémoPatte account will be deleted on November 16, 2027')
  })

  it('écrit « 1er » pour le premier du mois en français', () => {
    const email = warningEmail(
      { email: 'sophie@exemple.test', locale: 'fr' },
      { kind: 'plus-ended', accessEndedAt: '2026-03-01T10:00:00.000Z' },
      '2027-04-01',
    )

    expect(email?.subject).toBe(
      `Votre compte MémoPatte sera supprimé le 1er${NBSP}avril${NBSP}2027`,
    )
    expect(email?.text).toContain(`a pris fin le 1er${NBSP}mars${NBSP}2026.`)
  })

  it('date la fin d’accès en UTC, comme le calendrier de la purge', () => {
    const email = warningEmail(
      { email: 'sophie@exemple.test', locale: 'fr' },
      { kind: 'plus-ended', accessEndedAt: '2026-11-15T23:30:00.000Z' },
      '2027-11-16',
    )

    expect(email?.text).toContain(`a pris fin le 15${NBSP}novembre${NBSP}2026.`)
  })

  const neverBought = {
    kind: 'never-bought',
    createdAt: '2026-01-10T08:00:00.123456+00:00',
  } as const

  it('compte confirmé sans achat : variante française, datée de la création', () => {
    const email = warningEmail(
      { email: 'paul@exemple.test', locale: 'fr' },
      neverBought,
      '2027-01-11',
    )

    expect(email).toEqual({
      from: 'noreply@memopatte.app',
      to: 'paul@exemple.test',
      subject: `Votre compte MémoPatte sera supprimé le 11${NBSP}janvier${NBSP}2027`,
      text:
        `Bonjour, votre compte MémoPatte a été créé le 10${NBSP}janvier${NBSP}2026 sans abonnement Plus. ` +
        "Comme l'annonce notre politique de confidentialité, un compte sans accès Plus pendant 12 mois est supprimé. " +
        `Le 11${NBSP}janvier${NBSP}2027, nous supprimerons votre compte, adresse e-mail comprise, ` +
        'votre sauvegarde dans le cloud et vos photos sauvegardées. ' +
        'Les données sur votre téléphone ne sont pas touchées. ' +
        "Pour garder votre compte et votre sauvegarde, abonnez-vous à MémoPatte Plus dans l'app avant cette date. " +
        'Vous pouvez aussi exporter vos données gratuitement depuis Paramètres. ' +
        `Une question, ou pour supprimer votre compte dès maintenant${NBSP}: contact@memopatte.app.`,
    })
  })

  it('compte confirmé sans achat : variante anglaise', () => {
    const email = warningEmail(
      { email: 'sam@exemple.test', locale: 'en' },
      neverBought,
      '2027-01-11',
    )

    expect(email).toEqual({
      from: 'noreply@memopatte.app',
      to: 'sam@exemple.test',
      subject: 'Your MémoPatte account will be deleted on January 11, 2027',
      text:
        'Hello, your MémoPatte account was created on January 10, 2026 without a Plus subscription. ' +
        'As our privacy policy states, an account without Plus access for 12 months is deleted. ' +
        'On January 11, 2027, we will delete your account, including your email address, ' +
        'your cloud backup and your backed-up photos. ' +
        'The data on your phone is not affected. ' +
        'To keep your account and your backup, subscribe to MémoPatte Plus in the app before that date. ' +
        'You can also export your data for free from Settings. ' +
        'Questions, or to delete your account right now: contact@memopatte.app.',
    })
  })

  it('aucun texte pour une adresse jamais confirmée', () => {
    expect(
      warningEmail(
        { email: 'sophie@exemple.test', locale: 'fr' },
        { kind: 'unconfirmed' },
        '2027-01-10',
      ),
    ).toBeNull()
  })

  it('aucune adresse en dur hors de l’expéditeur et du contact', () => {
    const source = readFileSync(new URL('../messages.ts', import.meta.url), 'utf8')

    expect(SENDER).toBe('noreply@memopatte.app')
    expect(CONTACT).toBe('contact@memopatte.app')
    expect(source.match(/[\w.+-]+@[\w-]+\.[\w.]+/g)).toEqual([SENDER, CONTACT])
  })
})
