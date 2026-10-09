const CANONICAL_HOST = 'memopatte.app'
const OLD_HOSTS = ['memopatte.gaelle-briet.fr', 'www.memopatte.app']

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!OLD_HOSTS.includes(url.hostname)) return env.ASSETS.fetch(request)
    url.protocol = 'https:'
    url.hostname = CANONICAL_HOST
    return Response.redirect(url.toString(), 301)
  },
}
