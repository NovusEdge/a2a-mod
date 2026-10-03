import assert from 'node:assert/strict'
import { startWorker } from './fake-worker.ts'
import { discover, send, getTask, cancelTask, type Fetcher } from '../hooks/client.ts'
import { isLive } from '../hooks/wire.ts'
import type { Outcome, Target, TaskOutcome } from '../types/index.d.ts'

const fetcher: Fetcher = async (url, init) => {
  const r = await fetch(url, init)
  return { status: r.status, ok: r.ok, text: await r.text() }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function settle(t: Target, o: Outcome): Promise<Outcome> {
  let cur = o
  while (cur.kind === 'task' && isLive(cur.state)) { await sleep(200); cur = await getTask(fetcher, t, cur.taskId) }
  return cur
}

const w = await startWorker()
try {
  const { cardUrl, card } = await discover(fetcher, w.url)
  for (const version of ['1.0', '0.3'] as const) {
    // The compat server accepts both versions on one endpoint.
    const t: Target = { ...card, cardUrl, version, alias: 'fake', addedAt: 0, auth: { kind: 'setting' } }

    assert.match((await settle(t, await send(fetcher, t, { text: 'hi' }))).text, /echo: hi/)

    const asked = (await settle(t, await send(fetcher, t, { text: 'ask colour' }))) as TaskOutcome
    assert.equal(asked.state, 'input-required')
    const answered = await settle(t, await send(fetcher, t, { text: 'blue', taskId: asked.taskId, contextId: asked.contextId }))
    assert.equal(answered.kind === 'task' && answered.state, 'completed')

    const slow = await send(fetcher, t, { text: 'slow 30 build' })
    assert.ok(slow.kind === 'task' && isLive(slow.state))
    const started = Date.now()
    const canceled = await cancelTask(fetcher, t, (slow as TaskOutcome).taskId)
    assert.equal(canceled.state, 'canceled')
    assert.ok(Date.now() - started < 2000, 'cancel should not wait for the slow skill')
    console.log(`e2e ${version}: ok`)
  }
} finally {
  await w.close()
}
