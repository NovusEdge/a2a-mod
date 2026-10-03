export type ProtocolVersion = '1.0' | '0.3'

export type Skill = { id: string; name: string; description: string }

/**
 * Where a worker's token comes from. The value itself is never stored here:
 * `setting` looks the alias up in the plugin's sensitive `tokens` setting.
 */
export type TokenSource =
  | { kind: 'setting' }
  | { kind: 'cmd'; cmd: string }
  | { kind: 'file'; path: string }

export type Worker = {
  alias: string
  name: string
  description: string
  cardUrl: string
  endpoint: string
  version: ProtocolVersion
  skills: Skill[]
  auth: TokenSource
  trustedOrigin?: string
  addedAt: number
}

/** A worker with its token resolved for one call. Never stored. */
export type Target = Worker & { token?: string }

export type TaskState =
  | 'submitted' | 'working' | 'completed' | 'failed' | 'canceled'
  | 'rejected' | 'input-required' | 'auth-required' | 'unknown'

export type Outcome =
  | { kind: 'message'; contextId?: string; text: string }
  | { kind: 'task'; taskId: string; contextId?: string; state: TaskState; text: string }

export type TaskOutcome = Extract<Outcome, { kind: 'task' }>

export type TrackedTask = {
  worker: string
  taskId: string
  contextId?: string
  state: TaskState
  startedAt: number
  failures: number
}

declare module 'claude-code' {
  interface PluginState {
    'a2a-mod': { tasks: TrackedTask[] }
  }
}
