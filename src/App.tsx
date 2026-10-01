import { useEffect, useRef, useState } from "react"
import {
  REFRESH_MS,
  SITES,
  blankReadings,
  formatAsOf,
  formatFt,
  formatStage,
  levelFor,
  notifyCrossings,
  refreshReadings,
  sendTestAlert,
  type Level,
  type Reading,
  type Site,
} from "./gauges"

export default function App() {
  const [readings, setReadings] = useState<Record<string, Reading>>(blankReadings)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [testOn, setTestOn] = useState(false)
  const [notifyNote, setNotifyNote] = useState<string | null>(null)
  const readingsRef = useRef(readings)
  const seq = useRef(0)

  useEffect(() => {
    let cancel = false

    const run = async () => {
      const mine = ++seq.current
      const next = await refreshReadings(readingsRef.current)
      if (cancel || mine !== seq.current) return
      readingsRef.current = next
      setReadings(next)
      setCheckedAt(new Date().toISOString())
      notifyCrossings(next)
    }

    void run()
    const id = window.setInterval(() => void run(), REFRESH_MS)
    return () => {
      cancel = true
      window.clearInterval(id)
    }
  }, [])

  async function onTest() {
    setTestOn(true)
    const result = await sendTestAlert()
    setNotifyNote(
      result === "shown"
        ? null
        : "Notifications are blocked in this browser. The banner still works.",
    )
  }

  const alertNames = SITES.filter((site) => {
    const reading = readings[site.id]
    return (
      site.actionFt != null &&
      reading.stageFt != null &&
      levelFor(reading.stageFt, site.actionFt) === "ALERT"
    )
  }).map((site) => site.name)

  const showBanner = testOn || alertNames.length > 0

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {showBanner && (
        <div
          role="alert"
          className="sticky top-0 z-10 bg-red-700 px-6 py-4 text-xl font-semibold text-white"
        >
          {alertNames.length > 0
            ? `ALERT — ${alertNames.join(", ")}`
            : "Test alert — Belmont Creek"}
        </div>
      )}

      <main className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              San Mateo County
            </p>
            <h1 className="text-4xl font-semibold tracking-tight">Creek gauges</h1>
            <p className="mt-2 text-lg text-slate-600">
              {checkedAt ? `Checked ${formatAsOf(checkedAt)}` : "Checking gauges…"}
              <span className="text-slate-400"> · refreshes every 5 minutes</span>
            </p>
            <p className="mt-1 text-sm text-slate-500">
              SAFE is under 80% of action. WATCH is 80% up to action. ALERT is at or
              above action. MONITOR has no action level.
            </p>
            {notifyNote && <p className="mt-2 text-sm text-slate-600">{notifyNote}</p>}
          </div>
          <button
            type="button"
            onClick={() => void onTest()}
            className="rounded-lg bg-slate-900 px-5 py-3 text-base font-semibold text-white hover:bg-slate-700"
          >
            Test alert
          </button>
        </header>

        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {SITES.map((site) => (
            <Card key={site.id} site={site} reading={readings[site.id]} />
          ))}
        </section>

        <footer className="mt-10 text-sm text-slate-500">
          Provisional data. Not an official warning.
        </footer>
      </main>
    </div>
  )
}

function Card({ site, reading }: { site: Site; reading: Reading }) {
  const level = cardStatus(site, reading)
  const pct =
    reading.stageFt == null || site.actionFt == null
      ? null
      : Math.round((reading.stageFt / site.actionFt) * 100)

  return (
    <article className={`rounded-2xl border-2 p-6 ${tone(level, reading)}`}>
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-xl font-semibold leading-snug">
          <a
            href={site.href}
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            {site.name}
          </a>
        </h2>
        {level && <Status level={level} />}
      </div>

      {site.badge && (
        <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {site.badge}
        </p>
      )}
      <p className="mt-2 text-sm text-slate-600">
        {reading.sourceLabel ?? site.sourceLabel}
      </p>
      {site.extraLink && (
        <a
          href={site.extraLink.href}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-slate-700 underline"
        >
          {site.extraLink.label}
        </a>
      )}

      {reading.stageFt == null ? (
        <p className="mt-6 text-3xl font-semibold text-slate-700">
          {reading.noFeed ? "No live public feed" : reading.failed ? "Couldn't load" : "Loading…"}
        </p>
      ) : (
        <p className="mt-4 flex items-end gap-3">
          <span className="text-7xl font-semibold leading-none tabular-nums">
            {formatStage(reading.stageFt)}
          </span>
          <span className="mb-1 text-2xl text-slate-700">ft</span>
        </p>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-4 text-lg">
        <div>
          <dt className="text-sm text-slate-500">
            {site.fullPoolFt == null ? "Action" : "Full pool"}
          </dt>
          <dd className="font-semibold tabular-nums">
            {site.fullPoolFt != null
              ? `${formatFt(site.fullPoolFt)} ft`
              : site.actionFt == null
                ? "—"
                : `${formatFt(site.actionFt)} ft`}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">% of action level</dt>
          <dd className="font-semibold tabular-nums">{pct == null ? "—" : `${pct}%`}</dd>
        </div>
      </dl>

      <p className="mt-4 text-base text-slate-700">
        {reading.observedAt ? `as of ${formatAsOf(reading.observedAt)}` : "as of —"}
        {reading.stale && (
          <span className="ml-2 font-semibold uppercase tracking-wide text-amber-800">
            STALE
          </span>
        )}
      </p>
    </article>
  )
}

function cardStatus(site: Site, reading: Reading): Level | "MONITOR" | null {
  if (reading.stageFt == null) return null
  if (site.actionFt == null) return "MONITOR"
  return levelFor(reading.stageFt, site.actionFt)
}

function Status({ level }: { level: Level | "MONITOR" }) {
  const styles: Record<Level | "MONITOR", string> = {
    SAFE: "bg-green-700",
    WATCH: "bg-amber-500",
    ALERT: "bg-red-700",
    MONITOR: "bg-sky-800",
  }
  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold tracking-wide text-white ${styles[level]}`}
    >
      {level}
    </span>
  )
}

function tone(level: Level | "MONITOR" | null, reading: Reading): string {
  if (reading.stageFt == null) return "border-slate-300 bg-slate-50"
  if (level === "ALERT") return "border-red-600 bg-red-50"
  if (level === "WATCH") return "border-amber-500 bg-amber-50"
  if (level === "MONITOR") return "border-sky-700 bg-sky-50"
  return "border-green-600 bg-green-50"
}
