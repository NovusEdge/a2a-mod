// Static figure: one task, from `send` to the wake-up. Two layouts of the same sequence, because
// a wide figure scaled to a phone is too small to read. CSS (.diagram.wide/.tall) shows one.

function Arrow({ x1, y1, x2, y2, accent }: { x1: number; y1: number; x2: number; y2: number; accent?: boolean }) {
  const horizontal = y1 === y2
  const sign = (horizontal ? x2 > x1 : y2 > y1) ? 1 : -1
  const head = horizontal
    ? `${x2},${y2} ${x2 - sign * 8},${y2 - 4} ${x2 - sign * 8},${y2 + 4}`
    : `${x2},${y2} ${x2 - 4},${y2 - sign * 8} ${x2 + 4},${y2 - sign * 8}`
  const end = horizontal ? { x: x2 - sign * 7, y: y2 } : { x: x2, y: y2 - sign * 7 }
  return (
    <>
      <line className={accent ? 'dg-acc' : 'dg-line'} x1={x1} y1={y1} x2={end.x} y2={end.y} />
      <polygon className={accent ? 'dg-head acc' : 'dg-head'} points={head} />
    </>
  )
}

function Wide() {
  const you = 50, claude = 135, worker = 235
  return (
    <svg className="diagram wide" viewBox="0 0 640 300" role="img" aria-labelledby="dg-wide-t">
      <title id="dg-wide-t">Claude sends a task. If the worker answers inside about 7.5 seconds, the result comes straight back. Otherwise Claude gets a task id and keeps working, the mod polls every 5 seconds, and a wake message returns the result.</title>
      {[[you, 'You'], [claude, 'Claude'], [worker, 'Worker']].map(([y, name]) => (
        <g key={name}>
          <text className="dg-h" x="0" y={Number(y) + 4}>{name}</text>
          <line className="dg-lane" x1="64" y1={y} x2="634" y2={y} />
        </g>
      ))}

      <Arrow x1={92} y1={you} x2={92} y2={claude} />
      <text className="dg-t" x="102" y="97">ask</text>

      <Arrow x1={150} y1={claude} x2={150} y2={worker} />
      <text className="dg-t" x="160" y="190">send</text>

      <path className="dg-acc" d="M150 255 v7 H326 v-7" />
      <text className="dg-a" x="238" y="282" textAnchor="middle">inline window ≈ 7.5 s</text>

      <Arrow x1={226} y1={worker} x2={226} y2={claude} />
      <text className="dg-t" x="236" y="190">result returned</text>

      <line className="dg-acc" x1="338" y1={claude} x2="634" y2={claude} strokeWidth="3" />
      <text className="dg-a dg-halo" x="338" y="119">task id, Claude keeps working</text>

      {[374, 420, 466].map(x => (
        <g key={x}>
          <Arrow x1={x} y1={claude} x2={x} y2={worker} />
          <Arrow x1={x + 14} y1={worker} x2={x + 14} y2={claude} />
        </g>
      ))}
      <text className="dg-m" x="430" y="282" textAnchor="middle">poll every 5 s</text>

      <Arrow x1={610} y1={worker} x2={610} y2={claude} accent />
      <text className="dg-a dg-halo" x="598" y="178" textAnchor="end">wake: A2A task</text>
      <text className="dg-a dg-halo" x="598" y="194" textAnchor="end">finished:</text>
    </svg>
  )
}

function Tall() {
  const you = 56, claude = 190, worker = 324
  return (
    <svg className="diagram tall" viewBox="0 0 380 540" role="img" aria-labelledby="dg-tall-t">
      <title id="dg-tall-t">Claude sends a task. If the worker answers inside about 7.5 seconds, the result comes straight back. Otherwise Claude gets a task id and keeps working, the mod polls every 5 seconds, and a wake message returns the result.</title>
      {[[you, 'You', 90], [claude, 'Claude', 520], [worker, 'Worker', 520]].map(([x, name, end]) => (
        <g key={name}>
          <text className="dg-h" x={x} y="14" textAnchor="middle">{name}</text>
          <line className="dg-lane" x1={x} y1="28" x2={x} y2={end} />
        </g>
      ))}

      <Arrow x1={you} y1={66} x2={claude} y2={66} />
      <text className="dg-t" x={(you + claude) / 2} y="57" textAnchor="middle">ask</text>

      <Arrow x1={claude} y1={108} x2={worker} y2={108} />
      <text className="dg-t" x={(claude + worker) / 2} y="99" textAnchor="middle">send</text>

      <path className="dg-acc" d="M108 108 h-7 V200 h7" />
      <text className="dg-a" x="92" y="148" textAnchor="end">inline window</text>
      <text className="dg-a" x="92" y="164" textAnchor="end">≈ 7.5 s</text>

      <Arrow x1={worker} y1={156} x2={claude} y2={156} />
      <text className="dg-t" x={(claude + worker) / 2} y="147" textAnchor="middle">result returned</text>

      <line className="dg-acc" x1={claude} y1="230" x2={claude} y2="500" strokeWidth="3" />
      <text className="dg-a" x="180" y="244" textAnchor="end">task id,</text>
      <text className="dg-a" x="180" y="260" textAnchor="end">Claude keeps</text>
      <text className="dg-a" x="180" y="276" textAnchor="end">working</text>

      {[296, 332, 368].map(y => (
        <g key={y}>
          <Arrow x1={claude} y1={y} x2={worker} y2={y} />
          <Arrow x1={worker} y1={y + 10} x2={claude} y2={y + 10} />
        </g>
      ))}
      <text className="dg-m" x="180" y="340" textAnchor="end">poll every</text>
      <text className="dg-m" x="180" y="356" textAnchor="end">5 s</text>

      <Arrow x1={worker} y1={440} x2={claude} y2={440} accent />
      <text className="dg-a dg-halo" x={(claude + worker) / 2} y="430" textAnchor="middle">wake: A2A task finished:</text>
    </svg>
  )
}

export function Diagram() {
  return (
    <figure className="figure not-prose">
      <Wide />
      <Tall />
    </figure>
  )
}
