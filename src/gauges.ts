export type Level = "SAFE" | "WATCH" | "ALERT"

export type Reading = {
  stageFt: number | null
  observedAt: string | null
  stale: boolean
  noFeed: boolean
  failed: boolean
  sourceLabel: string | null
}

type SiteBase = {
  id: string
  name: string
  actionFt: number | null
  href: string
  sourceLabel: string
  badge?: string
  extraLink?: { label: string; href: string }
  fullPoolFt?: number
}

export type Site =
  | (SiteBase & { kind: "usgs"; usgsId: string })
  | (SiteBase & { kind: "usgs-nwis"; usgsId: string; parameterCd: string })
  | (SiteBase & { kind: "noaa"; noaaLid: string })
  | (SiteBase & { kind: "onerain"; path: string })
  | (SiteBase & { kind: "crystal" })
  | (SiteBase & { kind: "tide" })

type Point = { stageFt: number; observedAt: string }

const ALERTED_KEY = "creek-gauge-alerted"
const REFRESH_MS = 5 * 60 * 1000

export { REFRESH_MS }

export const SITES: Site[] = [
  {
    id: "ocrc1",
    name: "Belmont Creek at Harbor Blvd / Old County Rd",
    actionFt: 4.1,
    href: "https://water.noaa.gov/gauges/ocrc1",
    sourceLabel: "NOAA OCRC1",
    kind: "noaa",
    noaaLid: "OCRC1",
  },
  {
    id: "pecc1",
    name: "Pescadero Creek near Pescadero",
    actionFt: 10,
    href: "https://waterdata.usgs.gov/monitoring-location/11162500/",
    sourceLabel: "USGS 11162500",
    kind: "usgs",
    usgsId: "11162500",
  },
  {
    id: "sfcc1",
    name: "San Francisquito Creek at Stanford University",
    actionFt: 11,
    href: "https://waterdata.usgs.gov/monitoring-location/11164500/",
    sourceLabel: "USGS 11164500",
    kind: "usgs",
    usgsId: "11164500",
  },
  {
    id: "colma",
    name: "Colma Creek at Orange Memorial Park",
    actionFt: 6.75,
    href: "https://oneshorelineearlywarning.onerain.com/site/?site_id=12",
    sourceLabel: "OneShoreline",
    kind: "onerain",
    path: onerainProxy(
      "https://oneshorelineearlywarning.onerain.com/export/flot/?method=sensor&site_id=12&device_id=5&site=32e8ebb1-4c9c-460a-a4cd-58903b96f347&device=dbbbcf6d-6a38-44a5-a90b-7077db13c5c2",
    ),
  },
  {
    id: "pilarcitos",
    name: "Pilarcitos Creek above Stone Dam nr Hillsborough",
    actionFt: null,
    href: "https://waterdata.usgs.gov/monitoring-location/11162619/",
    sourceLabel: "USGS 11162619",
    kind: "usgs-nwis",
    usgsId: "11162619",
    parameterCd: "00065",
  },
  {
    id: "stage-road",
    name: "Pescadero Creek at Stage Road",
    actionFt: null,
    href: "https://oneshorelineearlywarning.onerain.com/site/?site_id=28&site=b7ae4c33-4536-443f-bcc5-72ded98d2412",
    sourceLabel: "OneShoreline",
    kind: "onerain",
    path: onerainProxy(
      "https://oneshorelineearlywarning.onerain.com/export/flot/?method=sensor&site_id=28&device_id=1&site=b7ae4c33-4536-443f-bcc5-72ded98d2412&device=cbd2cde7-ac86-4ad2-8a9d-a2f6d7575cd8",
    ),
  },
  {
    id: "crystal",
    name: "Lower Crystal Springs Reservoir at Dam",
    actionFt: null,
    href: "https://cdec.water.ca.gov/dynamicapp/staMeta?station_id=CRY",
    sourceLabel: "CDEC CRY",
    badge: "reservoir elevation",
    fullPoolFt: 287.8,
    kind: "crystal",
  },
  {
    id: "sf-tide",
    name: "San Francisco tide (9414290)",
    actionFt: 1.2,
    href: "https://tidesandcurrents.noaa.gov/stationhome.html?id=9414290",
    extraLink: {
      label: "Inundation Dashboard",
      href: "https://tidesandcurrents.noaa.gov/inundationdb/",
    },
    sourceLabel: "NOAA 9414290, ft MHHW",
    kind: "tide",
  },
]

function onerainProxy(upstream: string): string {
  return `/api/onerain?url=${encodeURIComponent(upstream)}`
}

const USGS_IDS = SITES.filter((site) => site.kind === "usgs").map((site) => site.usgsId)
const NWIS_BASE = "https://nwis.waterservices.usgs.gov/nwis/iv/"

// waterservices.usgs.gov JSON was returning 503. The same IV service on the
// nwis host still answers, so try the documented host first, then that one.
const USGS_BASES = [
  "https://waterservices.usgs.gov/nwis/iv/",
  "https://nwis.waterservices.usgs.gov/nwis/iv/",
]

export function blankReading(): Reading {
  return {
    stageFt: null,
    observedAt: null,
    stale: false,
    noFeed: false,
    failed: false,
    sourceLabel: null,
  }
}

export function blankReadings(): Record<string, Reading> {
  return Object.fromEntries(SITES.map((site) => [site.id, blankReading()]))
}

export function levelFor(stageFt: number, actionFt: number): Level {
  if (stageFt >= actionFt) return "ALERT"
  if (stageFt >= actionFt * 0.8) return "WATCH"
  return "SAFE"
}

export function formatFt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 })
}

export function formatStage(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatAsOf(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date)
}

export async function refreshReadings(
  prev: Record<string, Reading>,
): Promise<Record<string, Reading>> {
  const onerainSites = SITES.filter((site) => site.kind === "onerain")
  const nwisSites = SITES.filter((site) => site.kind === "usgs-nwis")
  const [usgsResult, noaaResult, onerainResults, nwisResults, crystalResult, tideResult] =
    await Promise.all([
      fetchUsgsHeights().then(
        (value) => ({ ok: true as const, value }),
        () => ({ ok: false as const }),
      ),
      fetchNoaaStage("OCRC1").then(
        (value) => ({ ok: true as const, value }),
        () => ({ ok: false as const }),
      ),
      Promise.all(
        onerainSites.map((site) =>
          fetchFlot(site.path).then(
            (point) => [site.path, { ok: true as const, point }] as const,
            () => [site.path, { ok: false as const }] as const,
          ),
        ),
      ),
      Promise.all(
        nwisSites.map((site) =>
          fetchUsgsPoint(site.usgsId, site.parameterCd).then(
            (point) => [site.id, { ok: true as const, point }] as const,
            () => [site.id, { ok: false as const }] as const,
          ),
        ),
      ),
      fetchCrystal().then(
        (value) => ({ ok: true as const, value }),
        () => ({ ok: false as const }),
      ),
      fetchTide().then(
        (value) => ({ ok: true as const, value }),
        () => ({ ok: false as const }),
      ),
    ])
  const onerain = new Map<string, { ok: true; point: Point } | { ok: false }>()
  for (const [path, hit] of onerainResults) onerain.set(path, hit)
  const nwis = new Map<string, { ok: true; point: Point | null } | { ok: false }>()
  for (const [id, hit] of nwisResults) nwis.set(id, hit)
  const next: Record<string, Reading> = { ...prev }

  for (const site of SITES) {
    const prior = prev[site.id] ?? blankReading()
    if (site.kind === "usgs") {
      if (!usgsResult.ok) {
        next[site.id] = keepOrFail(prior)
        continue
      }
      const point = usgsResult.value[site.usgsId]
      next[site.id] = point ? fresh(point) : noFeed()
      continue
    }
    if (site.kind === "usgs-nwis") {
      const result = nwis.get(site.id)
      if (!result?.ok) {
        next[site.id] = keepOrFail(prior)
        continue
      }
      next[site.id] = result.point ? fresh(result.point) : noFeed()
      continue
    }
    if (site.kind === "noaa") {
      next[site.id] = noaaResult.ok ? fresh(noaaResult.value) : keepOrFail(prior)
      continue
    }
    if (site.kind === "onerain") {
      const result = onerain.get(site.path)
      next[site.id] = result?.ok ? fresh(result.point) : keepOrFail(prior)
      continue
    }
    if (site.kind === "crystal") {
      next[site.id] = crystalResult.ok
        ? fresh(crystalResult.value, crystalResult.value.sourceLabel)
        : keepOrFail(prior)
      continue
    }
    next[site.id] = tideResult.ok ? fresh(tideResult.value) : keepOrFail(prior)
  }

  return next
}

export function notifyCrossings(readings: Record<string, Reading>) {
  const seen = alertedSet()
  let changed = false

  for (const site of SITES) {
    const reading = readings[site.id]
    if (!reading || reading.stageFt == null || site.actionFt == null) {
      if (site.actionFt == null && seen.delete(site.id)) changed = true
      continue
    }
    const level = levelFor(reading.stageFt, site.actionFt)
    if (level === "ALERT") {
      if (seen.has(site.id)) continue
      seen.add(site.id)
      changed = true
      postNotification(
        `${site.name} ALERT`,
        `${formatStage(reading.stageFt)} ft, at or above action level ${formatFt(site.actionFt)} ft.`,
      )
      continue
    }
    if (seen.delete(site.id)) changed = true
  }

  if (changed) persistAlerted(seen)
}

export async function sendTestAlert(): Promise<"shown" | "blocked"> {
  if (typeof Notification === "undefined") return "blocked"
  let permission = Notification.permission
  if (permission === "default") permission = await Notification.requestPermission()
  if (permission !== "granted") return "blocked"
  new Notification("Creek gauge test", {
    body: "Test alert: Belmont Creek is at or above its action level (4.1 ft).",
  })
  return "shown"
}

function fresh(point: Point, sourceLabel: string | null = null): Reading {
  return {
    stageFt: point.stageFt,
    observedAt: point.observedAt,
    stale: false,
    noFeed: false,
    failed: false,
    sourceLabel,
  }
}

function noFeed(): Reading {
  return {
    stageFt: null,
    observedAt: null,
    stale: false,
    noFeed: true,
    failed: false,
    sourceLabel: null,
  }
}

function keepOrFail(prev: Reading): Reading {
  if (prev.stageFt != null) return { ...prev, stale: true }
  if (prev.noFeed) return prev
  return { ...blankReading(), failed: true }
}

async function fetchUsgsHeights(): Promise<Record<string, Point | null>> {
  return fetchUsgsSeries(USGS_BASES, USGS_IDS, "00065")
}

async function fetchUsgsPoint(siteId: string, parameterCd: string): Promise<Point | null> {
  const series = await fetchUsgsSeries([NWIS_BASE], [siteId], parameterCd)
  return series[siteId]
}

async function fetchUsgsSeries(
  bases: string[],
  siteIds: string[],
  parameterCd: string,
): Promise<Record<string, Point | null>> {
  let lastError: unknown = new Error("USGS request failed")
  for (const base of bases) {
    try {
      const url = new URL(base)
      url.searchParams.set("format", "json")
      url.searchParams.set("sites", siteIds.join(","))
      url.searchParams.set("parameterCd", parameterCd)
      url.searchParams.set("siteStatus", "all")
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) })
      if (!response.ok) throw new Error(`USGS ${response.status}`)
      return parseUsgs(await response.json(), siteIds)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

async function fetchFlot(path: string): Promise<Point> {
  const response = await fetch(path, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`OneRain ${response.status}`)
  return parseFlot(await response.json())
}

function parseFlot(payload: unknown): Point {
  const data = record(payload)?.data
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("OneRain response missing data")
  }
  const last = data[data.length - 1]
  if (!Array.isArray(last)) throw new Error("OneRain reading is not a pair")
  const timestampMs = numberOf(last[0])
  const stageFt = numberOf(last[1])
  if (timestampMs == null || stageFt == null) {
    throw new Error("OneRain reading is not numeric")
  }
  return { stageFt, observedAt: new Date(timestampMs).toISOString() }
}

async function fetchCrystal(): Promise<Point & { sourceLabel: string }> {
  try {
    const response = await fetch("/api/cdec-cry", { signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error(`CDEC ${response.status}`)
    return { ...parseCdec(await response.json()), sourceLabel: "CDEC CRY" }
  } catch {
    const point = await fetchUsgsPoint("11162750", "62615")
    if (!point) throw new Error("Crystal Springs has no USGS elevation")
    return { ...point, sourceLabel: "USGS 11162750" }
  }
}

function parseCdec(payload: unknown): Point {
  if (!Array.isArray(payload)) throw new Error("CDEC response missing data")
  for (let i = payload.length - 1; i >= 0; i -= 1) {
    const row = record(payload[i])
    const stageFt = numberOf(row?.value)
    const when = stringOf(row?.obsDate) ?? stringOf(row?.date)
    if (stageFt == null || stageFt <= -900 || !when) continue
    return { stageFt, observedAt: pacificLocalToIso(when) }
  }
  throw new Error("CDEC elevation is empty")
}

async function fetchTide(): Promise<Point> {
  const response = await fetch(
    "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=9414290&product=water_level&datum=MHHW&time_zone=lst_ldt&units=english&format=json",
    { signal: AbortSignal.timeout(12000) },
  )
  if (!response.ok) throw new Error(`Tide ${response.status}`)
  return parseTide(await response.json())
}

function parseTide(payload: unknown): Point {
  const data = record(payload)?.data
  if (!Array.isArray(data) || data.length === 0) throw new Error("Tide response missing data")
  const last = record(data[data.length - 1])
  const stageFt = numberOf(last?.v)
  const when = stringOf(last?.t)
  if (stageFt == null || !when) throw new Error("Tide reading is not numeric")
  return { stageFt, observedAt: pacificLocalToIso(when) }
}

function pacificLocalToIso(raw: string): string {
  const match = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/)
  if (!match) {
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) throw new Error(`Bad time ${raw}`)
    return parsed.toISOString()
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  for (const offset of [7, 8]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hour + offset, minute))
    const parts = Object.fromEntries(
      fmt.formatToParts(candidate).map((part) => [part.type, part.value]),
    )
    if (
      Number(parts.year) === year &&
      Number(parts.month) === month &&
      Number(parts.day) === day &&
      Number(parts.hour) === hour &&
      Number(parts.minute) === minute
    ) {
      return candidate.toISOString()
    }
  }
  throw new Error(`Could not place ${raw} in Pacific time`)
}

async function fetchNoaaStage(lid: string): Promise<Point> {
  const response = await fetch(
    `https://api.water.noaa.gov/nwps/v1/gauges/${lid}/stageflow`,
    { signal: AbortSignal.timeout(12000) },
  )
  if (!response.ok) throw new Error(`NOAA ${response.status}`)
  return parseNoaa(await response.json())
}

function parseUsgs(payload: unknown, ids: string[]): Record<string, Point | null> {
  const out: Record<string, Point | null> = {}
  for (const id of ids) out[id] = null

  const root = record(payload)
  const value = record(root?.value)
  const series = value?.timeSeries
  if (!Array.isArray(series)) throw new Error("USGS response missing timeSeries")

  for (const row of series) {
    const item = record(row)
    const source = record(item?.sourceInfo)
    const codes = source?.siteCode
    const code = Array.isArray(codes) ? stringOf(record(codes[0])?.value) : null
    if (!code || !(code in out)) continue

    const variable = record(item?.variable)
    const noData = numberOf(variable?.noDataValue)
    const values = item?.values
    const block = Array.isArray(values) ? record(values[0]) : null
    const points = block?.value
    if (!Array.isArray(points)) continue

    for (let i = points.length - 1; i >= 0; i -= 1) {
      const point = record(points[i])
      const stage = numberOf(point?.value)
      const observedAt = stringOf(point?.dateTime)
      if (stage == null || stage === noData || !observedAt) continue
      out[code] = { stageFt: stage, observedAt }
      break
    }
  }

  return out
}

function parseNoaa(payload: unknown): Point {
  const root = record(payload)
  const observed = record(root?.observed)
  const units = stringOf(observed?.primaryUnits)
  if (units && units !== "ft") throw new Error(`NOAA stage units are ${units}`)
  const data = observed?.data
  if (!Array.isArray(data)) throw new Error("NOAA response missing observed stage")

  const points: Point[] = []
  for (const row of data) {
    const item = record(row)
    const stage = numberOf(item?.primary)
    const observedAt = stringOf(item?.validTime)
    if (stage == null || stage <= -900 || !observedAt) continue
    points.push({ stageFt: stage, observedAt })
  }
  points.sort((a, b) => a.observedAt.localeCompare(b.observedAt))
  const latest = points[points.length - 1]
  if (!latest) throw new Error("NOAA observed stage is empty")
  return latest
}

function record(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") return value as Record<string, unknown>
  return null
}

function stringOf(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function numberOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

let alerted: Set<string> | null = null

function alertedSet(): Set<string> {
  if (alerted) return alerted
  alerted = new Set()
  try {
    const raw = sessionStorage.getItem(ALERTED_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed)) {
      for (const id of parsed) {
        if (typeof id === "string") alerted.add(id)
      }
    }
  } catch {
    // sessionStorage can be blocked; the in-memory set still covers this tab.
  }
  return alerted
}

function persistAlerted(ids: Set<string>) {
  try {
    sessionStorage.setItem(ALERTED_KEY, JSON.stringify([...ids]))
  } catch {
    // Ignore quota or privacy-mode failures.
  }
}

function postNotification(title: string, body: string) {
  if (typeof Notification === "undefined") return
  if (Notification.permission !== "granted") return
  new Notification(title, { body })
}
