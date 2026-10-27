const CANONICAL_HOST = 'memopatte.app'
const OLD_HOSTS = ['memopatte.gaelle-briet.fr', 'www.memopatte.app', 'memopatte.pages.dev']

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
}

function withSecurityHeaders(response) {
  const secured = new Response(response.body, response)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) secured.headers.set(name, value)
  return secured
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!OLD_HOSTS.includes(url.hostname))
      return withSecurityHeaders(await env.ASSETS.fetch(request))
    url.protocol = 'https:'
    url.hostname = CANONICAL_HOST
    return withSecurityHeaders(Response.redirect(url.toString(), 301))
  },
}
