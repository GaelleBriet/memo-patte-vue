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
} else {
  console.error('usage : cdp.mjs eval <expression> | tap <x> <y> | type <texte>')
  process.exitCode = 1
}
ws.close()
