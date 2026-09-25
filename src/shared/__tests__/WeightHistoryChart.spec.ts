import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { nextTick } from 'vue'

import WeightHistoryChart from '../components/WeightHistoryChart.vue'
import { buildHistoryWeightChart, type WeightChartEntry } from '../domain/weight-chart'
import i18n, { applyLocale } from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

function pesees(...items: [string, number][]): WeightChartEntry[] {
  return items.map(([measuredOn, weightKg]) => ({ measuredOn, weightKg }))
}

const MILO = pesees(
  ['2026-03-04', 23.6],
  ['2026-03-18', 23.8],
  ['2026-04-22', 24.0],
  ['2026-06-10', 24.1],
  ['2026-07-28', 24.3],
  ['2026-09-15', 24.5],
)

const DAY_MS = 86_400_000

/** Une pesée tous les quatorze jours du 3 août 2025 au 13 sept. 2026, de 4,2 à 24,5 kg. */
const TRENTE = Array.from({ length: 30 }, (_, index) => ({
  measuredOn: new Date(Date.UTC(2025, 7, 3) + index * 14 * DAY_MS).toISOString().slice(0, 10),
  weightKg: Math.round((4.2 + index * 0.7) * 10) / 10,
}))

const PAGE_RECENTE = buildHistoryWeightChart(TRENTE.slice(18))!
const SVG_LEFT = 10

let wrapper: VueWrapper | null = null

function monter(entries: readonly WeightChartEntry[] = TRENTE, selected: number | null = null) {
  const monte: VueWrapper = mount(WeightHistoryChart, {
    props: {
      entries,
      selected,
      'onUpdate:selected': (value: number | null) => monte.setProps({ selected: value }),
    },
    global: { plugins: [vuetify, i18n] },
    attachTo: document.body,
  })
  wrapper = monte
  return monte
}

function selections(monte: VueWrapper) {
  return (monte.emitted('update:selected') ?? []).map(([index]) => index)
}

function periode(monte: VueWrapper) {
  return {
    dates: monte.get('.weight-history-chart__range').text(),
    pesees: monte.get('.weight-history-chart__count').text(),
  }
}

function fleche(monte: VueWrapper, sens: 'previous' | 'next') {
  const bouton = monte.get(`.weight-history-chart__turn--${sens}`)
  return {
    bouton,
    libelle: bouton.attributes('aria-label'),
    grisee: bouton.attributes('aria-disabled') === 'true',
  }
}

function points(monte: VueWrapper) {
  return monte.findAll('.weight-chart-trace__point')
}

function graduations(monte: VueWrapper) {
  return monte.findAll('.weight-history-chart__tick').map((tick) => tick.text())
}

// jsdom n'a pas de PointerEvent : un MouseEvent du même nom porte `clientX`, `clientY` et `buttons`.
async function doigt(monte: VueWrapper, type: string, x: number, y = 100, buttons = 1) {
  monte
    .get('.weight-history-chart__svg')
    .element.dispatchEvent(
      new MouseEvent(type, { clientX: SVG_LEFT + x, clientY: y, buttons, bubbles: true }),
    )
  await nextTick()
}

/** `false` quand la courbe garde le doigt et empêche l'écran de défiler. */
function deplacerLEcran(monte: VueWrapper): boolean {
  const deplacement = new Event('touchmove', { cancelable: true, bubbles: true })
  monte.get('.weight-history-chart__svg').element.dispatchEvent(deplacement)
  return !deplacement.defaultPrevented
}

async function toucher(monte: VueWrapper, x: number) {
  await doigt(monte, 'pointerdown', x)
  await doigt(monte, 'pointerup', x, 100, 0)
}

async function glisser(monte: VueWrapper, depuis: number, jusqua: number) {
  await doigt(monte, 'pointerdown', depuis)
  await doigt(monte, 'pointermove', (depuis + jusqua) / 2)
  await doigt(monte, 'pointermove', jusqua)
  await doigt(monte, 'pointerup', jusqua, 100, 0)
}

beforeEach(() => {
  vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: SVG_LEFT,
    width: PAGE_RECENTE.width,
  } as DOMRect)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('WeightHistoryChart — repères', () => {
  it('trace une ligne de repère par graduation en kg ronds, l’unité au-dessus', () => {
    const monte = monter(MILO)

    expect(monte.findAll('.weight-history-chart__grid')).toHaveLength(4)
    expect(graduations(monte)).toEqual(['23,5', '24', '24,5', '25'])
    expect(monte.get('.weight-history-chart__unit').text()).toBe('kg')
  })

  it('écrit les mois sous la courbe, aucun chiffre sur les points', () => {
    const monte = monter(MILO)

    expect(monte.findAll('.weight-chart-trace__month').map((m) => m.text())).toEqual([
      'Mars',
      'Avr.',
      'Mai',
      'Juin',
      'Juil.',
      'Août',
      'Sept.',
    ])
    expect(points(monte)).toHaveLength(6)
    expect(monte.find('.weight-sparkline__extreme').exists()).toBe(false)
  })
})

describe('WeightHistoryChart — taille', () => {
  it('se redessine à la largeur rendue de sa carte, pixel pour pixel', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly callback: () => void) {}
        observe() {
          this.callback()
        }
        disconnect() {}
      },
    )
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 300,
    } as DOMRect)

    const monte = monter(MILO)
    await nextTick()

    expect(monte.get('.weight-history-chart__svg').attributes('viewBox')).toBe('0 0 300 190')
  })
})

describe('WeightHistoryChart — pages', () => {
  it('s’ouvre sur les douze pesées les plus récentes', () => {
    const monte = monter()

    expect(points(monte)).toHaveLength(12)
    expect(periode(monte)).toEqual({ dates: 'avr. 2026\u00a0– sept. 2026', pesees: '12 pesées' })
  })

  it('grise la flèche des pesées suivantes sur la page la plus récente, et le dit', () => {
    const monte = monter()

    expect(fleche(monte, 'previous')).toMatchObject({
      libelle: 'Pesées précédentes',
      grisee: false,
    })
    expect(fleche(monte, 'next')).toMatchObject({
      libelle: 'Pesées suivantes, aucune',
      grisee: true,
    })
  })

  it('remonte le temps par la flèche ‹, jusqu’au début du suivi', async () => {
    const monte = monter()

    await fleche(monte, 'previous').bouton.trigger('click')
    expect(periode(monte)).toEqual({ dates: 'oct. 2025\u00a0– mars 2026', pesees: '12 pesées' })
    expect(fleche(monte, 'next')).toMatchObject({ libelle: 'Pesées suivantes', grisee: false })

    await fleche(monte, 'previous').bouton.trigger('click')
    expect(periode(monte)).toEqual({
      dates: 'août 2025\u00a0– oct. 2025',
      pesees: '6 pesées · début du suivi',
    })
    expect(points(monte)).toHaveLength(6)
    expect(fleche(monte, 'previous')).toMatchObject({
      libelle: 'Pesées précédentes, aucune',
      grisee: true,
    })
  })

  it('ne va pas au-delà de la première ni de la dernière pesée', async () => {
    const monte = monter()

    await fleche(monte, 'next').bouton.trigger('click')
    expect(periode(monte).dates).toBe('avr. 2026\u00a0– sept. 2026')

    await fleche(monte, 'previous').bouton.trigger('click')
    await fleche(monte, 'previous').bouton.trigger('click')
    await fleche(monte, 'previous').bouton.trigger('click')
    expect(periode(monte).dates).toBe('août 2025\u00a0– oct. 2025')
  })

  it('revient d’une page par la flèche ›', async () => {
    const monte = monter()

    await fleche(monte, 'previous').bouton.trigger('click')
    await fleche(monte, 'next').bouton.trigger('click')

    expect(periode(monte).dates).toBe('avr. 2026\u00a0– sept. 2026')
  })

  it('recalcule l’échelle en kg pour chaque page', async () => {
    const monte = monter()
    expect(graduations(monte)).toEqual(['15', '20', '25'])

    await fleche(monte, 'previous').bouton.trigger('click')
    expect(graduations(monte)).toEqual(['5', '10', '15', '20'])

    await fleche(monte, 'previous').bouton.trigger('click')
    expect(graduations(monte)).toEqual(['4', '5', '6', '7', '8'])
  })

  it('tient en une seule page jusqu’à douze pesées, les deux flèches grisées', () => {
    const monte = monter(MILO)

    expect(periode(monte)).toEqual({
      dates: 'mars 2026\u00a0– sept. 2026',
      pesees: '6 pesées · début du suivi',
    })
    expect(fleche(monte, 'previous').grisee).toBe(true)
    expect(fleche(monte, 'next').grisee).toBe(true)
  })

  it('écrit une pesée au singulier sur une page qui n’en a qu’une', async () => {
    const monte = monter(TRENTE.slice(17))

    await fleche(monte, 'previous').bouton.trigger('click')

    expect(periode(monte)).toEqual({
      dates: 'mars 2026',
      pesees: '1 pesée · début du suivi',
    })
    expect(points(monte)).toHaveLength(1)
  })

  it('n’écrit qu’un mois quand la page tient dans un seul', () => {
    const monte = monter(TRENTE.slice(15, 18))

    expect(periode(monte)).toEqual({ dates: 'mars 2026', pesees: '3 pesées · début du suivi' })
  })

  it('écrit la période en anglais', async () => {
    applyLocale('en')
    try {
      const monte = monter()
      expect(periode(monte)).toEqual({ dates: 'Apr 2026\u00a0– Sep 2026', pesees: '12 weigh-ins' })

      await monte.setProps({ entries: TRENTE.slice(15, 18) })
      expect(periode(monte)).toEqual({
        dates: 'Mar 2026',
        pesees: '3 weigh-ins · start of tracking',
      })
    } finally {
      applyLocale('fr')
    }
  })

  it('annonce la nouvelle période au lecteur d’écran', () => {
    const monte = monter()

    expect(monte.get('.weight-history-chart__period').attributes('aria-live')).toBe('polite')
  })

  it('remet la sélection à la pesée la plus récente en changeant de page', async () => {
    const monte = monter(TRENTE, 25)

    await fleche(monte, 'previous').bouton.trigger('click')

    expect(selections(monte)).toEqual([null])
  })

  it('garde la page affichée quand une pesée est corrigée ou supprimée', async () => {
    const monte = monter()
    await fleche(monte, 'previous').bouton.trigger('click')

    await monte.setProps({ entries: TRENTE.map((e, i) => (i === 10 ? { ...e, weightKg: 20 } : e)) })
    expect(periode(monte)).toEqual({ dates: 'oct. 2025\u00a0– mars 2026', pesees: '12 pesées' })

    await monte.setProps({ entries: TRENTE.filter((_, index) => index !== 25) })
    expect(periode(monte)).toEqual({ dates: 'oct. 2025\u00a0– mars 2026', pesees: '12 pesées' })
    expect(fleche(monte, 'next').grisee).toBe(false)
  })

  it('montre la page la plus ancienne quand la page affichée disparaît, sans bloquer les flèches', async () => {
    const monte = monter(TRENTE.slice(0, 25))
    await fleche(monte, 'previous').bouton.trigger('click')
    await fleche(monte, 'previous').bouton.trigger('click')
    expect(periode(monte).pesees).toBe('1 pesée · début du suivi')

    await monte.setProps({ entries: TRENTE.slice(1, 25) })
    expect(periode(monte).pesees).toBe('12 pesées · début du suivi')
    expect(fleche(monte, 'previous').grisee).toBe(true)

    await fleche(monte, 'next').bouton.trigger('click')
    expect(periode(monte).dates).toBe('févr. 2026\u00a0– juil. 2026')
    expect(fleche(monte, 'next').grisee).toBe(true)
  })

  it('revient à la page la plus récente quand on le lui demande, après un ajout', async () => {
    const monte = monter()
    await fleche(monte, 'previous').bouton.trigger('click')
    await monte.setProps({ entries: [...TRENTE, { measuredOn: '2026-09-20', weightKg: 24.6 }] })

    ;(monte.vm as unknown as { showLatestPage: () => void }).showLatestPage()
    await nextTick()

    expect(periode(monte).dates).toBe('avr. 2026\u00a0– sept. 2026')
    expect(points(monte)).toHaveLength(12)
  })
})

describe('WeightHistoryChart — glisser', () => {
  it('montre la page précédente quand le doigt glisse vers la droite', async () => {
    const monte = monter()

    await glisser(monte, 100, 200)

    expect(periode(monte).dates).toBe('oct. 2025\u00a0– mars 2026')
  })

  it('montre la page suivante quand le doigt glisse vers la gauche', async () => {
    const monte = monter()
    await glisser(monte, 100, 200)

    await glisser(monte, 200, 100)

    expect(periode(monte).dates).toBe('avr. 2026\u00a0– sept. 2026')
  })

  it('fait suivre la courbe au doigt pendant le geste, puis la repose', async () => {
    const monte = monter()
    await fleche(monte, 'previous').bouton.trigger('click')

    await doigt(monte, 'pointerdown', 100)
    await doigt(monte, 'pointermove', 160)
    expect(monte.get('.weight-history-chart__svg').attributes('style')).toContain(
      'translateX(60px)',
    )
    expect(deplacerLEcran(monte)).toBe(false)

    await doigt(monte, 'pointerup', 160, 100, 0)
    expect(monte.get('.weight-history-chart__svg').attributes('style') ?? '').not.toContain(
      'translateX',
    )
  })

  it('résiste au bout du suivi : la courbe suit à peine le doigt, la page ne change pas', async () => {
    const monte = monter()

    await doigt(monte, 'pointerdown', 200)
    await doigt(monte, 'pointermove', 100)
    expect(monte.get('.weight-history-chart__svg').attributes('style')).toContain(
      'translateX(-25px)',
    )

    await doigt(monte, 'pointerup', 100, 100, 0)
    expect(periode(monte).dates).toBe('avr. 2026\u00a0– sept. 2026')
    expect(monte.get('.weight-history-chart__svg').attributes('style') ?? '').not.toContain(
      'translateX',
    )
  })

  it('garde la page quand le doigt glisse trop peu', async () => {
    const monte = monter()

    await glisser(monte, 100, 140)

    expect(periode(monte).dates).toBe('avr. 2026\u00a0– sept. 2026')
  })

  it('ne sélectionne aucune pesée en glissant', async () => {
    const monte = monter()

    await glisser(monte, 100, 200)
    await glisser(monte, 200, 150)

    expect(selections(monte)).not.toContainEqual(expect.any(Number))
  })

  it('laisse l’écran défiler quand le doigt part à la verticale', async () => {
    const monte = monter()

    await doigt(monte, 'pointerdown', 100, 100)
    await doigt(monte, 'pointermove', 104, 160)
    expect(deplacerLEcran(monte)).toBe(true)
    expect(monte.get('.weight-history-chart__svg').attributes('style') ?? '').not.toContain(
      'translateX',
    )
    await doigt(monte, 'pointercancel', 104, 160, 0)

    expect(periode(monte).dates).toBe('avr. 2026\u00a0– sept. 2026')
    expect(selections(monte)).toEqual([])
  })

  it('repose la courbe quand le navigateur reprend le geste', async () => {
    const monte = monter()
    await doigt(monte, 'pointerdown', 100)
    await doigt(monte, 'pointermove', 140)

    await doigt(monte, 'pointercancel', 140, 100, 0)

    expect(monte.get('.weight-history-chart__svg').attributes('style') ?? '').not.toContain(
      'translateX',
    )
    expect(periode(monte).dates).toBe('avr. 2026\u00a0– sept. 2026')
  })
})

describe('WeightHistoryChart — animation', () => {
  const animate = vi.fn<(keyframes: Keyframe[], options: KeyframeAnimationOptions) => void>()
  let reduite: boolean

  beforeEach(() => {
    reduite = false
    Object.defineProperty(SVGElement.prototype, 'animate', { value: animate, configurable: true })
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' && reduite,
    }))
  })

  afterEach(() => {
    Reflect.deleteProperty(SVGElement.prototype, 'animate')
    animate.mockReset()
  })

  it('fait entrer la nouvelle page du côté d’où elle vient', async () => {
    const monte = monter()

    await fleche(monte, 'previous').bouton.trigger('click')

    expect(animate).toHaveBeenCalledOnce()
    expect(animate.mock.calls[0]![0][0]).toMatchObject({ transform: 'translateX(-32px)' })
  })

  it('ramène la courbe qui résiste au bout du suivi', async () => {
    const monte = monter()

    await glisser(monte, 200, 100)

    expect(animate).toHaveBeenCalledOnce()
    expect(animate.mock.calls[0]![0]).toEqual([
      { transform: 'translateX(-25px)' },
      { transform: 'translateX(0)' },
    ])
  })

  it('ne bouge rien quand le système demande moins d’animations', async () => {
    reduite = true
    const monte = monter()

    await fleche(monte, 'previous').bouton.trigger('click')
    await glisser(monte, 100, 60)

    expect(animate).not.toHaveBeenCalled()
    expect(periode(monte).dates).toBe('oct. 2025\u00a0– mars 2026')
  })
})

describe('WeightHistoryChart — toucher', () => {
  it('ne pose ni trait ni point agrandi au repos', () => {
    const monte = monter()

    expect(monte.find('.weight-history-chart__cursor').exists()).toBe(false)
    expect(monte.find('.weight-history-chart__active').exists()).toBe(false)
  })

  it('sélectionne la pesée la plus proche du doigt : trait vertical et point agrandi', async () => {
    const monte = monter()
    const troisieme = PAGE_RECENTE.points[2]!

    await toucher(monte, troisieme.x + 6)

    expect(selections(monte)).toEqual([20])
    expect(Number(monte.get('.weight-history-chart__cursor').attributes('x1'))).toBe(troisieme.x)
    const actif = monte.get('.weight-history-chart__active')
    expect(Number(actif.attributes('cx'))).toBe(troisieme.x)
    expect(Number(actif.attributes('cy'))).toBe(troisieme.y)
    expect(Number(actif.attributes('r'))).toBe(7)
  })

  it('sélectionne au lever du doigt, pas à l’appui', async () => {
    const monte = monter()

    await doigt(monte, 'pointerdown', PAGE_RECENTE.points[2]!.x)

    expect(selections(monte)).toEqual([])
  })

  it('ignore un survol sans appui', async () => {
    const monte = monter()

    await doigt(monte, 'pointermove', 0, 100, 0)

    expect(selections(monte)).toEqual([])
  })

  it('ne dessine pas la sélection d’une autre page', () => {
    const monte = monter(TRENTE, 3)

    expect(monte.find('.weight-history-chart__cursor').exists()).toBe(false)
  })
})

describe('WeightHistoryChart — appui long', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('sélectionne la pesée sous le doigt resté posé, puis la suit quand il glisse', async () => {
    const monte = monter()

    await doigt(monte, 'pointerdown', PAGE_RECENTE.points[4]!.x)
    vi.advanceTimersByTime(400)
    await nextTick()
    expect(selections(monte)).toEqual([22])

    await doigt(monte, 'pointermove', PAGE_RECENTE.points[7]!.x)
    await doigt(monte, 'pointermove', PAGE_RECENTE.points[1]!.x)
    expect(selections(monte)).toEqual([22, 25, 19])
  })

  it('garde la page et la pesée quand le doigt se lève', async () => {
    const monte = monter()

    await doigt(monte, 'pointerdown', PAGE_RECENTE.points[4]!.x)
    vi.advanceTimersByTime(400)
    await doigt(monte, 'pointermove', PAGE_RECENTE.points[4]!.x + 120)
    await doigt(monte, 'pointerup', PAGE_RECENTE.points[4]!.x + 120, 100, 0)

    expect(periode(monte).dates).toBe('avr. 2026\u00a0– sept. 2026')
    expect(selections(monte).at(-1)).toBe(18 + 4 + 5)
    expect(monte.get('.weight-history-chart__svg').attributes('style') ?? '').not.toContain(
      'translateX',
    )
  })

  it('n’attend pas l’appui long d’un doigt qui glisse déjà', async () => {
    const monte = monter()

    await doigt(monte, 'pointerdown', 100)
    await doigt(monte, 'pointermove', 130)
    vi.advanceTimersByTime(400)
    await nextTick()

    expect(selections(monte)).toEqual([])
  })

  it('empêche l’écran de défiler sous le doigt qui parcourt les pesées', async () => {
    const monte = monter()
    await doigt(monte, 'pointerdown', 100)
    vi.advanceTimersByTime(400)
    const deplacement = new Event('touchmove', { cancelable: true, bubbles: true })

    monte.get('.weight-history-chart__svg').element.dispatchEvent(deplacement)

    expect(deplacement.defaultPrevented).toBe(true)
  })

  it('laisse défiler l’écran avant l’appui long', async () => {
    const monte = monter()
    await doigt(monte, 'pointerdown', 100)
    const deplacement = new Event('touchmove', { cancelable: true, bubbles: true })

    monte.get('.weight-history-chart__svg').element.dispatchEvent(deplacement)

    expect(deplacement.defaultPrevented).toBe(false)
  })

  it('n’ouvre pas le menu du navigateur', () => {
    const monte = monter()
    const menu = new MouseEvent('contextmenu', { cancelable: true, bubbles: true })

    monte.get('.weight-history-chart__svg').element.dispatchEvent(menu)

    expect(menu.defaultPrevented).toBe(true)
  })
})

describe('WeightHistoryChart — clavier et lecteur d’écran', () => {
  it('prend le focus comme un curseur qui parcourt les pesées de la page', () => {
    const svg = monter().get('.weight-history-chart__svg')

    expect(svg.attributes('tabindex')).toBe('0')
    expect(svg.attributes('role')).toBe('slider')
    expect(svg.attributes('aria-label')).toBe('Évolution du poids')
    expect(svg.attributes('aria-valuemin')).toBe('1')
    expect(svg.attributes('aria-valuemax')).toBe('12')
  })

  it('annonce la dernière pesée de la page au repos, date en toutes lettres', () => {
    const svg = monter().get('.weight-history-chart__svg')

    expect(svg.attributes('aria-valuenow')).toBe('12')
    expect(svg.attributes('aria-valuetext')).toBe('Pesée du 13 septembre 2026, 24,5\u00a0kg')
  })

  it('parcourt les pesées aux flèches gauche et droite, et annonce la pesée sélectionnée', async () => {
    const monte = monter()
    const svg = monte.get('.weight-history-chart__svg')

    await svg.trigger('keydown', { key: 'ArrowLeft' })
    await svg.trigger('keydown', { key: 'ArrowLeft' })
    await svg.trigger('keydown', { key: 'ArrowRight' })

    expect(selections(monte)).toEqual([28, 27, 28])
    expect(svg.attributes('aria-valuenow')).toBe('11')
    expect(svg.attributes('aria-valuetext')).toBe('Pesée du 30 août 2026, 23,8\u00a0kg')
  })

  it('saute à la première pesée de la page par Début, à la dernière par Fin', async () => {
    const monte = monter()
    const svg = monte.get('.weight-history-chart__svg')

    await svg.trigger('keydown', { key: 'Home' })
    expect(svg.attributes('aria-valuetext')).toBe('Pesée du 12 avril 2026, 16,8\u00a0kg')

    await svg.trigger('keydown', { key: 'End' })
    expect(selections(monte)).toEqual([18, 29])
    expect(Number(monte.get('.weight-history-chart__cursor').attributes('x1'))).toBe(
      PAGE_RECENTE.points[11]!.x,
    )
  })

  it('reste sur la pesée du bout de la page quand la flèche pousse au-delà', async () => {
    const monte = monter(TRENTE, 18)
    const svg = monte.get('.weight-history-chart__svg')

    await svg.trigger('keydown', { key: 'ArrowLeft' })
    expect(svg.attributes('aria-valuenow')).toBe('1')

    await svg.trigger('keydown', { key: 'End' })
    await svg.trigger('keydown', { key: 'ArrowRight' })
    expect(svg.attributes('aria-valuenow')).toBe('12')
    expect(selections(monte)).toEqual([29])
  })

  it('accepte aussi les flèches haut et bas des lecteurs d’écran', async () => {
    const monte = monter()
    const svg = monte.get('.weight-history-chart__svg')

    await svg.trigger('keydown', { key: 'ArrowDown' })
    await svg.trigger('keydown', { key: 'ArrowUp' })

    expect(selections(monte)).toEqual([28, 29])
  })

  it('montre les pesées précédentes par PageDown, les suivantes par PageUp', async () => {
    const monte = monter()
    const svg = monte.get('.weight-history-chart__svg')

    await svg.trigger('keydown', { key: 'PageDown' })
    expect(periode(monte).dates).toBe('oct. 2025\u00a0– mars 2026')
    expect(svg.attributes('aria-valuetext')).toBe('Pesée du 29 mars 2026, 16,1\u00a0kg')

    await svg.trigger('keydown', { key: 'PageUp' })
    expect(periode(monte).dates).toBe('avr. 2026\u00a0– sept. 2026')
  })

  it('ne change rien par PageUp ni PageDown au bout du suivi', async () => {
    const monte = monter()
    const svg = monte.get('.weight-history-chart__svg')

    await svg.trigger('keydown', { key: 'PageUp' })
    expect(periode(monte).dates).toBe('avr. 2026\u00a0– sept. 2026')

    await svg.trigger('keydown', { key: 'PageDown' })
    await svg.trigger('keydown', { key: 'PageDown' })
    await svg.trigger('keydown', { key: 'PageDown' })
    expect(periode(monte).dates).toBe('août 2025\u00a0– oct. 2025')
  })

  it('laisse passer les autres touches', async () => {
    const monte = monter()
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })

    monte.get('.weight-history-chart__svg').element.dispatchEvent(tab)

    expect(tab.defaultPrevented).toBe(false)
    expect(selections(monte)).toEqual([])
  })

  it('prend le focus quand on le lui demande, sans faire défiler l’écran', () => {
    const monte = monter()

    ;(monte.vm as unknown as { focus: () => void }).focus()

    expect(document.activeElement).toBe(monte.get('.weight-history-chart__svg').element)
  })
})
