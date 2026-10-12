const [, , mode, ...args] = process.argv
const port = process.env.CDP_PORT ?? '9340'
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = targets.find((target) => target.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
const pending = new Map()
let lastId = 0
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  pending.get(message.id)?.(message)
  pending.delete(message.id)
}
await new Promise((resolve) => (ws.onopen = resolve))

function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++lastId
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

if (mode === 'eval') {
  const { result } = await send('Runtime.evaluate', {
    expression: args.join(' '),
    awaitPromise: true,
    returnByValue: true,
  })
  const value = result?.result?.value ?? result?.exceptionDetails ?? result
  process.stdout.write(`${JSON.stringify(value, null, 1)}\n`)
} else if (mode === 'tap') {
  const [x, y] = args.map(Number)
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await new Promise((resolve) => setTimeout(resolve, 60))
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
} else if (mode === 'type') {
  await send('Input.insertText', { text: args.join(' ') })
} else if (mode === 'freeze') {
  // Jour figé à midi pour toute la page, puis rechargement : l'app lit ce jour-là au démarrage.
  const source = `(()=>{const R=Date;const off=new R('${args[0]}T12:00:00').getTime()-R.now();class F extends R{constructor(...a){super(...(a.length?a:[R.now()+off]))}static now(){return R.now()+off}}window.Date=F})()`
  await send('Page.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source })
  await send('Page.reload')
  await new Promise((resolve) => setTimeout(resolve, Number(args[1] ?? 6000)))
} else if (mode === 'shot') {
  const { result } = await send('Page.captureScreenshot', { format: 'png' })
  const { writeFileSync } = await import('node:fs')
  writeFileSync(args[0], Buffer.from(result.data, 'base64'))
} else {
  console.error(
    'usage : cdp.mjs eval <expression> | tap <x> <y> | type <texte> | freeze <AAAA-MM-JJ> | shot <fichier.png>',
  )
  process.exitCode = 1
}
ws.close()
