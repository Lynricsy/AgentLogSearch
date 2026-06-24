const API_PROXY_TARGET = (process.env.API_PROXY_TARGET ?? "http://api:3001").replace(/\/+$/, "")
const PROXY_TIMEOUT_MS = 180_000
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
])

type RouteContext = {
  readonly params: Promise<{
    readonly path?: readonly string[]
  }>
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return proxyApiRequest(request, context)
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return proxyApiRequest(request, context)
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return proxyApiRequest(request, context)
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return proxyApiRequest(request, context)
}

async function proxyApiRequest(request: Request, context: RouteContext): Promise<Response> {
  const target = await buildTargetUrl(request, context)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS)

  try {
    const response = await fetch(target, {
      body: request.body,
      duplex: "half",
      headers: toForwardHeaders(request.headers),
      method: request.method,
      redirect: "manual",
      signal: controller.signal,
    } as RequestInit)

    return new Response(response.body, {
      headers: toResponseHeaders(response.headers),
      status: response.status,
      statusText: response.statusText,
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function buildTargetUrl(request: Request, context: RouteContext): Promise<string> {
  const { path = [] } = await context.params
  const source = new URL(request.url)
  const target = new URL(`${API_PROXY_TARGET}/api/${path.map(encodeURIComponent).join("/")}`)
  target.search = source.search
  return target.toString()
}

function toForwardHeaders(headers: Headers): Headers {
  const forwarded = new Headers()
  for (const [key, value] of headers) {
    const normalized = key.toLocaleLowerCase("en-US")
    if (!HOP_BY_HOP_HEADERS.has(normalized) && normalized !== "host") {
      forwarded.set(key, value)
    }
  }
  return forwarded
}

function toResponseHeaders(headers: Headers): Headers {
  const forwarded = new Headers()
  for (const [key, value] of headers) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLocaleLowerCase("en-US"))) {
      forwarded.set(key, value)
    }
  }
  return forwarded
}
