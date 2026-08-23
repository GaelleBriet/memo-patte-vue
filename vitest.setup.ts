// jsdom ne fournit pas ResizeObserver, utilisé par le système de layout de Vuetify (VApp).
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserver
