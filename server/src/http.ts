import type { NextFunction, Request, Response } from 'express'

export const NO_STORE = 'no-store'
export const CATALOG_CACHE = 'public, max-age=5'

export function sendJson(res: Response, status: number, body: unknown, cacheControl: string): void {
  res.status(status)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', cacheControl)
  res.send(JSON.stringify(body))
}

export function sendOk(
  res: Response,
  status: number,
  schema: { parse: (data: unknown) => unknown },
  data: unknown,
  cacheControl: string,
): void {
  sendJson(res, status, schema.parse({ ok: true, data }), cacheControl)
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}
