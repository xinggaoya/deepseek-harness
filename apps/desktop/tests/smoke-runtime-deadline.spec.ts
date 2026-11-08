import { afterEach, expect, it } from 'vitest'
import { smokeDeadlineMs } from '../scripts/smoke-runtime.ts'

const configured = process.env.DSH_DESKTOP_SMOKE_TIMEOUT_MS
afterEach(() => {
  if (configured === undefined) delete process.env.DSH_DESKTOP_SMOKE_TIMEOUT_MS
  else process.env.DSH_DESKTOP_SMOKE_TIMEOUT_MS = configured
})

it('keeps the default deadline when the build host sets none', () => {
  delete process.env.DSH_DESKTOP_SMOKE_TIMEOUT_MS
  expect(smokeDeadlineMs()).toBe(120_000)
})

it('raises the deadline for a build host that converts Office documents slowly', () => {
  process.env.DSH_DESKTOP_SMOKE_TIMEOUT_MS = '600000'
  expect(smokeDeadlineMs()).toBe(600_000)
})

it('rejects a deadline that is not a positive integer', () => {
  for (const value of ['0', '-1', '1.5', 'abc', '']) {
    process.env.DSH_DESKTOP_SMOKE_TIMEOUT_MS = value
    expect(() => smokeDeadlineMs()).toThrow('DSH_DESKTOP_SMOKE_TIMEOUT_MS must be a positive integer')
  }
})
