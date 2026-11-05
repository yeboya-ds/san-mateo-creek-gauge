import type { IncomingMessage, ServerResponse } from "node:http"
import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import { fetchOneRain, isAllowedOneRainUrl } from "./api/onerain.js"

const CDEC_CRY =
  "https://cdec.water.ca.gov/dynamicapp/req/JSONDataServlet?Stations=CRY&SensorNums=6&dur_code=E"

// OneRain answers with a session cookie on a 302 and sends no
// Access-Control-Allow-Origin. CDEC also sends no CORS header.
function dataProxy(): Plugin {
  return {
    name: "data-proxy",
    configureServer(server) {
      server.middlewares.use("/api/onerain", (req, res) => {
        if (!allowGet(req.method, res)) return
        const target = oneRainTarget(req)
        if (!target) {
          res.statusCode = 400
          res.setHeader("Content-Type", "application/json")
          res.end(JSON.stringify({ error: "OneRain URL is not allowed" }))
          return
        }
        void sendJson(res, () => fetchOneRain(target))
      })
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

function oneRainTarget(req: IncomingMessage): string | null {
  const raw = req.url ?? ""
  const query = raw.includes("?") ? raw.slice(raw.indexOf("?")) : ""
  const target = new URLSearchParams(query).get("url")
  return target && isAllowedOneRainUrl(target) ? target : null
}

export default defineConfig({
  plugins: [react(), dataProxy()],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
})
