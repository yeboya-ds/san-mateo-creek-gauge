const HOST = "oneshorelineearlywarning.onerain.com"

export function isAllowedOneRainUrl(value) {
  if (typeof value !== "string" || value.length === 0) return false
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  return (
    parsed.protocol === "https:" &&
    parsed.hostname === HOST &&
    (parsed.pathname === "/export/flot" || parsed.pathname === "/export/flot/")
  )
}

export async function fetchOneRain(start) {
  if (!isAllowedOneRainUrl(start)) throw new Error("OneRain URL is not allowed")
  let url = start
  const cookies = new Map()

  for (let hop = 0; hop < 5; hop += 1) {
    const headers = { Accept: "application/json" }
    if (cookies.size > 0) {
      headers.Cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join("; ")
    }
    const response = await fetch(url, {
      redirect: "manual",
      headers,
      signal: AbortSignal.timeout(12000),
    })
    const setCookies =
      typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : []
    for (const raw of setCookies) {
      const pair = raw.split(";")[0] ?? ""
      const eq = pair.indexOf("=")
      if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) throw new Error("OneRain redirect missing location")
      url = new URL(location, url).toString()
      if (!sameHost(url)) throw new Error("OneRain redirect left the gauge host")
      continue
    }
    if (!response.ok) throw new Error(`OneRain ${response.status}`)
    return await response.text()
  }

  throw new Error("OneRain redirect loop")
}

function sameHost(value) {
  const parsed = new URL(value)
  return parsed.protocol === "https:" && parsed.hostname === HOST
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).end()
    return
  }

  const query = req.query?.url
  const raw = Array.isArray(query) ? query[0] : query
  if (!isAllowedOneRainUrl(raw)) {
    res.status(400).json({ error: "OneRain URL is not allowed" })
    return
  }

  try {
    const body = await fetchOneRain(raw)
    res.status(200)
    res.setHeader("Content-Type", "application/json")
    res.end(body)
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "OneRain proxy failed" })
  }
}
