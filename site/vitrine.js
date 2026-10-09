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

  action.addEventListener('click', () => {
    notification.classList.add('is-done')
    toast.hidden = false
    setTimeout(() => {
      toast.hidden = true
      setTimeout(() => {
        notification.classList.add('is-again')
        notification.style.animation = 'none'
        void notification.offsetWidth
        notification.style.animation = ''
        notification.classList.remove('is-done')
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
  activate(steps[0])
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

for (const phone of document.querySelectorAll('.hero-phone .phone')) playDemo(phone)
for (const tour of document.querySelectorAll('.tour')) followTour(tour)
