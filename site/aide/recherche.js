export function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’']/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function matches(text, query) {
  const haystack = normalize(text)
  return normalize(query)
    .split(' ')
    .filter((word) => word.length > 1)
    .every((word) => haystack.includes(word))
}

function filterThemes(themes, query) {
  let found = 0
  for (const theme of themes) {
    const title = theme.querySelector('h3').textContent
    let visible = 0
    for (const item of theme.querySelectorAll('li')) {
      const shown = matches(`${title} ${item.textContent} ${item.dataset.search ?? ''}`, query)
      item.hidden = !shown
      if (shown) visible += 1
    }
    theme.hidden = visible === 0
    found += visible
  }
  return found
}

if (typeof document !== 'undefined') {
  const form = document.querySelector('.help-search')
  const input = form.querySelector('input')
  const themes = document.querySelectorAll('.help-theme')
  const noResult = document.querySelector('.help-no-result')

  form.hidden = false
  form.addEventListener('submit', (event) => event.preventDefault())
  input.addEventListener('input', () => {
    noResult.hidden = filterThemes(themes, input.value) > 0
  })
}
