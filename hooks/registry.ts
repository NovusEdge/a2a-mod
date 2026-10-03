import type { StateRead, Timer } from 'claude-code'
import type { Target, TrackedTask, Worker } from '../types/index.d.ts'
import type { Fetcher } from './client.ts'

// The engine as the other modules see it. The loader refuses $ passed across an import,
// so register.ts builds this from $ in hostOf.
export type Host = {
  fetch: Fetcher
  readWorkers(): Promise<unknown>
  writeWorkers(all: Record<string, Worker>): Promise<void>
  env(name: TokenEnv): Promise<string | undefined>
  readTasks(): Promise<StateRead<TrackedTask[]>>
  /** False when another write landed since `ifVersion`. */
  writeTasks(tasks: TrackedTask[], ifVersion: number): Promise<boolean>
  status(text: string | undefined): void
  every(ms: number, fn: () => void): Timer
  sleep(ms: number): Promise<void>
  wake(text: string): Promise<void>
}

// $.env.get only takes a literal name, so a token can only come from these. register.ts spells each one.
export const TOKEN_ENVS = ['A2A_TOKEN_1', 'A2A_TOKEN_2', 'A2A_TOKEN_3', 'A2A_TOKEN_4', 'A2A_TOKEN_5', 'A2A_TOKEN_6', 'A2A_TOKEN_7', 'A2A_TOKEN_8', 'A2A_TOKEN_9'] as const
export type TokenEnv = (typeof TOKEN_ENVS)[number]
export const isTokenEnv = (name: string): name is TokenEnv => (TOKEN_ENVS as readonly string[]).includes(name)

export async function loadWorkers(host: Host): Promise<Record<string, Worker>> {
  return ((await host.readWorkers()) as Record<string, Worker> | undefined) ?? {}
}

export async function saveWorker(host: Host, w: Worker): Promise<void> {
  await host.writeWorkers({ ...(await loadWorkers(host)), [w.alias]: w })
}

export async function removeWorker(host: Host, alias: string): Promise<boolean> {
  const all = await loadWorkers(host)
  if (!(alias in all)) return false
  delete all[alias]
  await host.writeWorkers(all)
  return true
}

export async function targetOf(host: Host, w: Worker): Promise<Target> {
  const token = w.tokenEnv && isTokenEnv(w.tokenEnv) ? await host.env(w.tokenEnv) : undefined
  return token ? { ...w, token } : w
}
