import type { IconAliases } from 'vuetify'

// Icônes des écrans (maquettes v2)
import add from '@material-symbols/svg-400/outlined/add.svg?raw'
import arrowBack from '@material-symbols/svg-400/outlined/arrow_back.svg?raw'
import check from '@material-symbols/svg-400/outlined/check.svg?raw'
import edit from '@material-symbols/svg-400/outlined/edit.svg?raw'
import error from '@material-symbols/svg-400/outlined/error.svg?raw'
import home from '@material-symbols/svg-400/outlined/home.svg?raw'
import medication from '@material-symbols/svg-400/outlined/medication.svg?raw'
import monitorWeight from '@material-symbols/svg-400/outlined/monitor_weight.svg?raw'
import pestControl from '@material-symbols/svg-400/outlined/pest_control.svg?raw'
import pets from '@material-symbols/svg-400/outlined/pets.svg?raw'
import schedule from '@material-symbols/svg-400/outlined/schedule.svg?raw'
import settings from '@material-symbols/svg-400/outlined/settings.svg?raw'
import today from '@material-symbols/svg-400/outlined/today.svg?raw'
import vaccines from '@material-symbols/svg-400/outlined/vaccines.svg?raw'

// Icônes nécessaires aux alias internes de Vuetify
import arrowDownward from '@material-symbols/svg-400/outlined/arrow_downward.svg?raw'
import arrowDropDown from '@material-symbols/svg-400/outlined/arrow_drop_down.svg?raw'
import arrowForward from '@material-symbols/svg-400/outlined/arrow_forward.svg?raw'
import arrowRight from '@material-symbols/svg-400/outlined/arrow_right.svg?raw'
import arrowUpward from '@material-symbols/svg-400/outlined/arrow_upward.svg?raw'
import attachFile from '@material-symbols/svg-400/outlined/attach_file.svg?raw'
import backspace from '@material-symbols/svg-400/outlined/backspace.svg?raw'
import cached from '@material-symbols/svg-400/outlined/cached.svg?raw'
import calendarToday from '@material-symbols/svg-400/outlined/calendar_today.svg?raw'
import cancel from '@material-symbols/svg-400/outlined/cancel.svg?raw'
import checkBox from '@material-symbols/svg-400/outlined/check_box.svg?raw'
import checkBoxOutlineBlank from '@material-symbols/svg-400/outlined/check_box_outline_blank.svg?raw'
import checkCircle from '@material-symbols/svg-400/outlined/check_circle.svg?raw'
import chevronLeft from '@material-symbols/svg-400/outlined/chevron_left.svg?raw'
import chevronRight from '@material-symbols/svg-400/outlined/chevron_right.svg?raw'
import circle from '@material-symbols/svg-400/outlined/circle.svg?raw'
import close from '@material-symbols/svg-400/outlined/close.svg?raw'
import colorize from '@material-symbols/svg-400/outlined/colorize.svg?raw'
import firstPage from '@material-symbols/svg-400/outlined/first_page.svg?raw'
import fullscreen from '@material-symbols/svg-400/outlined/fullscreen.svg?raw'
import fullscreenExit from '@material-symbols/svg-400/outlined/fullscreen_exit.svg?raw'
import indeterminateCheckBox from '@material-symbols/svg-400/outlined/indeterminate_check_box.svg?raw'
import info from '@material-symbols/svg-400/outlined/info.svg?raw'
import keyboardArrowDown from '@material-symbols/svg-400/outlined/keyboard_arrow_down.svg?raw'
import keyboardArrowUp from '@material-symbols/svg-400/outlined/keyboard_arrow_up.svg?raw'
import keyboardCommandKey from '@material-symbols/svg-400/outlined/keyboard_command_key.svg?raw'
import keyboardControlKey from '@material-symbols/svg-400/outlined/keyboard_control_key.svg?raw'
import keyboardOptionKey from '@material-symbols/svg-400/outlined/keyboard_option_key.svg?raw'
import keyboardReturn from '@material-symbols/svg-400/outlined/keyboard_return.svg?raw'
import lastPage from '@material-symbols/svg-400/outlined/last_page.svg?raw'
import menu from '@material-symbols/svg-400/outlined/menu.svg?raw'
import palette from '@material-symbols/svg-400/outlined/palette.svg?raw'
import pause from '@material-symbols/svg-400/outlined/pause.svg?raw'
import playArrow from '@material-symbols/svg-400/outlined/play_arrow.svg?raw'
import radioButtonChecked from '@material-symbols/svg-400/outlined/radio_button_checked.svg?raw'
import radioButtonUnchecked from '@material-symbols/svg-400/outlined/radio_button_unchecked.svg?raw'
import remove from '@material-symbols/svg-400/outlined/remove.svg?raw'
import search from '@material-symbols/svg-400/outlined/search.svg?raw'
import shift from '@material-symbols/svg-400/outlined/shift.svg?raw'
import spaceBar from '@material-symbols/svg-400/outlined/space_bar.svg?raw'
import star from '@material-symbols/svg-400/outlined/star.svg?raw'
import starFill from '@material-symbols/svg-400/outlined/star-fill.svg?raw'
import starHalf from '@material-symbols/svg-400/outlined/star_half.svg?raw'
import unfoldMore from '@material-symbols/svg-400/outlined/unfold_more.svg?raw'
import upload from '@material-symbols/svg-400/outlined/upload.svg?raw'
import volumeDown from '@material-symbols/svg-400/outlined/volume_down.svg?raw'
import volumeMute from '@material-symbols/svg-400/outlined/volume_mute.svg?raw'
import volumeOff from '@material-symbols/svg-400/outlined/volume_off.svg?raw'
import volumeUp from '@material-symbols/svg-400/outlined/volume_up.svg?raw'
import warning from '@material-symbols/svg-400/outlined/warning.svg?raw'

/**
 * Registre des icônes Material Symbols Outlined (jeu Vuetify `ms`).
 *
 * Unique endroit où une icône est déclarée : pour en ajouter une, importer son
 * SVG depuis `@material-symbols/svg-400/outlined/` avec le suffixe `?raw` et
 * l'ajouter ici. Les features n'importent jamais un SVG directement, elles
 * écrivent `<v-icon icon="ms:vaccines" />`. Seules les icônes listées ici
 * entrent dans le bundle.
 */
export const msIcons = {
  add,
  arrow_back: arrowBack,
  arrow_downward: arrowDownward,
  arrow_drop_down: arrowDropDown,
  arrow_forward: arrowForward,
  arrow_right: arrowRight,
  arrow_upward: arrowUpward,
  attach_file: attachFile,
  backspace,
  cached,
  calendar_today: calendarToday,
  cancel,
  check,
  check_box: checkBox,
  check_box_outline_blank: checkBoxOutlineBlank,
  check_circle: checkCircle,
  chevron_left: chevronLeft,
  chevron_right: chevronRight,
  circle,
  close,
  colorize,
  edit,
  error,
  first_page: firstPage,
  fullscreen,
  fullscreen_exit: fullscreenExit,
  home,
  indeterminate_check_box: indeterminateCheckBox,
  info,
  keyboard_arrow_down: keyboardArrowDown,
  keyboard_arrow_up: keyboardArrowUp,
  keyboard_command_key: keyboardCommandKey,
  keyboard_control_key: keyboardControlKey,
  keyboard_option_key: keyboardOptionKey,
  keyboard_return: keyboardReturn,
  last_page: lastPage,
  medication,
  menu,
  monitor_weight: monitorWeight,
  palette,
  pause,
  pest_control: pestControl,
  pets,
  play_arrow: playArrow,
  radio_button_checked: radioButtonChecked,
  radio_button_unchecked: radioButtonUnchecked,
  remove,
  schedule,
  search,
  settings,
  shift,
  space_bar: spaceBar,
  star,
  star_fill: starFill,
  star_half: starHalf,
  today,
  unfold_more: unfoldMore,
  upload,
  vaccines,
  volume_down: volumeDown,
  volume_mute: volumeMute,
  volume_off: volumeOff,
  volume_up: volumeUp,
  warning,
} as const

export type MsIconName = keyof typeof msIcons

/** Tracé d'une icône, prêt à être rendu dans un `<svg>`. */
export interface MsIconPath {
  viewBox: string
  path: string
}

const VIEW_BOX_ATTRIBUTE = /viewBox="([^"]+)"/
const PATH_ATTRIBUTE = /<path\s[^>]*?d="([^"]+)"/

/**
 * Extrait le `viewBox` et le tracé d'une icône du registre.
 * Renvoie `undefined` si l'icône n'y est pas déclarée.
 * Les SVG de `@material-symbols/svg-400` contiennent tous exactement un `<path>`.
 */
export function getMsIconPath(name: string): MsIconPath | undefined {
  if (!Object.prototype.hasOwnProperty.call(msIcons, name)) return undefined

  const svg = msIcons[name as MsIconName]
  const viewBox = VIEW_BOX_ATTRIBUTE.exec(svg)?.[1]
  const path = PATH_ATTRIBUTE.exec(svg)?.[1]

  return viewBox && path ? { viewBox, path } : undefined
}

/**
 * Alias internes de Vuetify (`$close`, `$checkboxOn`, `$prev`…) traduits en
 * icônes Material Symbols. Sans eux, les composants Vuetify n'affichent plus
 * aucune icône puisque `@mdi/font` a été retiré.
 */
export const msAliases: IconAliases = {
  collapse: 'ms:keyboard_arrow_up',
  complete: 'ms:check',
  cancel: 'ms:cancel',
  close: 'ms:close',
  delete: 'ms:cancel',
  clear: 'ms:cancel',
  success: 'ms:check_circle',
  info: 'ms:info',
  warning: 'ms:warning',
  error: 'ms:error',
  prev: 'ms:chevron_left',
  next: 'ms:chevron_right',
  checkboxOn: 'ms:check_box',
  checkboxOff: 'ms:check_box_outline_blank',
  checkboxIndeterminate: 'ms:indeterminate_check_box',
  delimiter: 'ms:circle',
  sortAsc: 'ms:arrow_upward',
  sortDesc: 'ms:arrow_downward',
  expand: 'ms:keyboard_arrow_down',
  menu: 'ms:menu',
  subgroup: 'ms:arrow_drop_down',
  dropdown: 'ms:arrow_drop_down',
  radioOn: 'ms:radio_button_checked',
  radioOff: 'ms:radio_button_unchecked',
  edit: 'ms:edit',
  ratingEmpty: 'ms:star',
  ratingFull: 'ms:star_fill',
  ratingHalf: 'ms:star_half',
  loading: 'ms:cached',
  first: 'ms:first_page',
  last: 'ms:last_page',
  unfold: 'ms:unfold_more',
  file: 'ms:attach_file',
  plus: 'ms:add',
  minus: 'ms:remove',
  calendar: 'ms:calendar_today',
  treeviewCollapse: 'ms:arrow_drop_down',
  treeviewExpand: 'ms:arrow_right',
  tableGroupCollapse: 'ms:keyboard_arrow_down',
  tableGroupExpand: 'ms:chevron_right',
  eyeDropper: 'ms:colorize',
  upload: 'ms:upload',
  color: 'ms:palette',
  command: 'ms:keyboard_command_key',
  ctrl: 'ms:keyboard_control_key',
  space: 'ms:space_bar',
  shift: 'ms:shift',
  alt: 'ms:keyboard_option_key',
  enter: 'ms:keyboard_return',
  arrowup: 'ms:arrow_upward',
  arrowdown: 'ms:arrow_downward',
  arrowleft: 'ms:arrow_back',
  arrowright: 'ms:arrow_forward',
  backspace: 'ms:backspace',
  play: 'ms:play_arrow',
  pause: 'ms:pause',
  fullscreen: 'ms:fullscreen',
  fullscreenExit: 'ms:fullscreen_exit',
  volumeHigh: 'ms:volume_up',
  volumeMedium: 'ms:volume_down',
  volumeLow: 'ms:volume_mute',
  volumeOff: 'ms:volume_off',
  search: 'ms:search',
}
