import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

/** One request the stub server received. */
export interface SeenRequest {
  method: string
  path: string
  headers: IncomingMessage['headers']
  body: unknown
}

/** Handler deciding the stub server's answer to one request. */
export type StubHandler = (request: SeenRequest, response: ServerResponse) => void

/** A local HTTP server standing in for the Octen API. */
export interface StubServer {
  baseURL: string
  seen: SeenRequest[]
  respond: (handler: StubHandler) => void
  close: () => Promise<void>
}

/** Start a stub Octen API on an ephemeral port. */
export async function startStub(): Promise<StubServer> {
  const seen: SeenRequest[] = []
  let handler: StubHandler = (_request, response) => { json(response, 200, { code: 0, msg: 'success', data: { results: [] } }) }
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      const entry: SeenRequest = {
        method: request.method ?? '',
        path: request.url ?? '',
        headers: request.headers,
        body: text.length > 0 ? JSON.parse(text) as unknown : undefined,
      }
      seen.push(entry)
      handler(entry, response)
    })
  })
  const address = await new Promise<AddressInfo>((resolve) => {
    server.listen(0, '127.0.0.1', () => { resolve(server.address() as AddressInfo) })
  })
  return {
    baseURL: `http://127.0.0.1:${String(address.port)}`,
    seen,
    respond: (next) => { handler = next },
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => { resolve() }) }),
  }
}

/** Write a JSON response. */
export function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}
