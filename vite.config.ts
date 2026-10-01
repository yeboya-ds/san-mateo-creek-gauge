import type { ServerResponse } from "node:http"
import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"

const ONERAIN: Record<string, string> = {
  "/api/colma":
    "https://oneshorelineearlywarning.onerain.com/export/flot/?method=sensor&site_id=12&device_id=5&site=32e8ebb1-4c9c-460a-a4cd-58903b96f347&device=dbbbcf6d-6a38-44a5-a90b-7077db13c5c2",
  "/api/stage-road":
    "https://oneshorelineearlywarning.onerain.com/export/flot/?method=sensor&site_id=28&device_id=1&site=b7ae4c33-4536-443f-bcc5-72ded98d2412&device=cbd2cde7-ac86-4ad2-8a9d-a2f6d7575cd8",
}

const CDEC_CRY =
  "https://cdec.water.ca.gov/dynamicapp/req/JSONDataServlet?Stations=CRY&SensorNums=6&dur_code=E"

// OneRain answers with a session cookie on a 302 and sends no
// Access-Control-Allow-Origin. CDEC also sends no CORS header.
function dataProxy(): Plugin {
  return {
    name: "data-proxy",
    configureServer(server) {
      for (const [path, upstream] of Object.entries(ONERAIN)) {
        server.middlewares.use(path, (req, res) => {
          if (!allowGet(req.method, res)) return
          void sendJson(res, () => fetchOneRain(upstream))
        })
      }
      server.middlewares.use("/api/cdec-cry", (req, res) => {
        if (!allowGet(req.method, res)) return
        void sendJson(res, () => fetchText(CDEC_CRY))
      })
    },
  }
}

function allowGet(method: string | undefined, res: ServerResponse): boolean {
  if (method === "GET" || method === "HEAD") return true
  res.statusCode = 405
  res.end()
  return false
}

async function sendJson(res: ServerResponse, load: () => Promise<string>) {
  try {
    const body = await load()
    res.statusCode = 200
    res.setHeader("Content-Type", "application/json")
    res.end(body)
  } catch (error) {
    res.statusCode = 502
    res.setHeader("Content-Type", "text/plain")
    res.end(error instanceof Error ? error.message : "Proxy failed")
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) })
  if (!response.ok) throw new Error(`Upstream ${response.status}`)
  return await response.text()
}

async function fetchOneRain(start: string): Promise<string> {
  let url = start
  const cookies = new Map<string, string>()

  for (let hop = 0; hop < 5; hop += 1) {
    const headers: Record<string, string> = { Accept: "application/json" }
    if (cookies.size > 0) {
      headers.Cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join("; ")
    }
    const response = await fetch(url, {
      redirect: "manual",
      headers,
      signal: AbortSignal.timeout(12000),
    })
    for (const raw of response.headers.getSetCookie()) {
      const pair = raw.split(";")[0] ?? ""
      const eq = pair.indexOf("=")
      if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) throw new Error("OneRain redirect missing location")
      url = new URL(location, url).toString()
      continue
    }
    if (!response.ok) throw new Error(`OneRain ${response.status}`)
    return await response.text()
  }

  throw new Error("OneRain redirect loop")
}

export default defineConfig({
  plugins: [react(), dataProxy()],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
})
