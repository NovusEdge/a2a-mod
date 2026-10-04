/** The status line: undefined clears it. */
export function statusText(running: number, waiting: number): string | undefined {
  if (!running && !waiting) return undefined
  return `a2a: ${running} running${waiting ? ` · ${waiting} waiting` : ''}`
}
