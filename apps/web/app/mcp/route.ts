const MCP_PROXY_TARGET = (
  process.env.MCP_PROXY_TARGET ??
  process.env.API_PROXY_TARGET ??
  "http://api:3001"
).replace(/\/+$/, "")

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

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  return proxyMcpRequest(request)
}

export async function POST(request: Request): Promise<Response> {
  return proxyMcpRequest(request)
}

export async function DELETE(request: Request): Promise<Response> {
  return proxyMcpRequest(request)
}

async function proxyMcpRequest(request: Request): Promise<Response> {
  const target = buildTargetUrl(request)
  const response = await fetch(target, {
    body: request.body,
    duplex: "half",
    headers: toForwardHeaders(request.headers),
    method: request.method,
    redirect: "manual",
  } as RequestInit)

  return new Response(response.body, {
    headers: toResponseHeaders(response.headers),
    status: response.status,
    statusText: response.statusText,
  })
}

function buildTargetUrl(request: Request): string {
  const source = new URL(request.url)
  const target = new URL(`${MCP_PROXY_TARGET}/mcp`)
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
