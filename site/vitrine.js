document.documentElement.classList.add('js')

const TOAST_MS = 3500
const BACK_MS = 1500

function playDemo(phone) {
  const notification = phone.querySelector('.notif')
  const action = phone.querySelector('.notif-action')
  const toast = phone.querySelector('.toast-text')
  const hint = phone.parentElement.querySelector('.demo-hint')
  if (!notification || !action || !toast) return
  if (hint) hint.hidden = false
  action.hidden = false
  toast.tabIndex = -1
  let playing = false

  action.addEventListener('click', () => {
    if (playing) return
    playing = true
    notification.classList.add('is-done')
    toast.hidden = false
    toast.focus({ preventScroll: true })
    setTimeout(() => {
      toast.hidden = true
      setTimeout(() => {
        notification.classList.add('is-again')
        notification.style.animation = 'none'
        void notification.offsetWidth
        notification.style.animation = ''
        notification.classList.remove('is-done')
        playing = false
      }, BACK_MS)
    }, TOAST_MS)
  })
}

function followTour(tour) {
  const steps = [...tour.querySelectorAll('.tour-step')]
  if (!steps.length || !('IntersectionObserver' in window)) return
  const activate = (step) => {
    for (const other of steps) other.classList.toggle('is-active', other === step)
  }
  tour.classList.add('is-live')
  activate(steps[0])
  for (const step of steps) step.addEventListener('focusin', () => activate(step))
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) activate(entry.target.closest('.tour-step'))
      }
    },
    { rootMargin: '-45% 0px -45% 0px' },
  )
  for (const step of steps) observer.observe(step.querySelector('.tour-text'))
}

function filterByPet(phone) {
  const screen = phone.querySelector('.screen')
  const buttons = [...phone.querySelectorAll('.pet-spot')]
  if (!screen || !buttons.length) return
  const everyone = { src: screen.src, srcset: screen.srcset, alt: screen.alt }
  const hint = phone.closest('.tour-step')?.querySelector('.pet-hint')
  if (hint) hint.hidden = false

  const show = ({ src, srcset, alt }) => {
    screen.srcset = srcset
    screen.src = src
    screen.alt = alt
  }
  const petScreen = (button) => ({
    src: button.dataset.src,
    srcset: `${button.dataset.small} 400w, ${button.dataset.src} 720w`,
    alt: button.dataset.alt,
  })

  for (const button of buttons) {
    button.hidden = false
    button.addEventListener('click', () => {
      const pressed = button.getAttribute('aria-pressed') === 'true'
      for (const other of buttons) other.setAttribute('aria-pressed', 'false')
      phone.classList.add('is-touched')
      if (pressed) return show(everyone)
      button.setAttribute('aria-pressed', 'true')
      show(petScreen(button))
    })
  }
  const preload = () => {
    for (const button of buttons) new Image().src = petScreen(button).src
  }
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      preload()
    })
    observer.observe(phone.closest('.tour-step') ?? phone)
  }
}

for (const phone of document.querySelectorAll('.hero-phone .phone')) playDemo(phone)
for (const phone of document.querySelectorAll('.pet-demo')) filterByPet(phone)
for (const tour of document.querySelectorAll('.tour')) followTour(tour)

function showBackToTop(link) {
  const update = () => {
    link.hidden = window.scrollY < window.innerHeight
  }
  update()
  window.addEventListener('scroll', update, { passive: true })
}

for (const link of document.querySelectorAll('.to-top')) showBackToTop(link)
