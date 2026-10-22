/**
 * The shared contract at src/lib/api-contract.ts imports `zod` from the repo
 * root. Installing this package should be enough for that file to resolve,
 * so link the server's zod into the root node_modules when the root install
 * has not already provided one.
 */
import { existsSync, mkdirSync, symlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const zodTarget = resolve(here, '../node_modules/zod')
const linkPath = resolve(here, '../../node_modules/zod')

if (!existsSync(zodTarget)) {
  console.warn('server/node_modules/zod is missing; skip the contract link')
  process.exit(0)
}

if (existsSync(linkPath)) {
  process.exit(0)
}

mkdirSync(dirname(linkPath), { recursive: true })
symlinkSync(zodTarget, linkPath, 'dir')
