const OLD_HOST = 'memopatte.gaelle-briet.fr'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.hostname !== OLD_HOST) return env.ASSETS.fetch(request)
    url.protocol = 'https:'
    url.hostname = 'memopatte.app'
    return Response.redirect(url.toString(), 301)
  },
}
