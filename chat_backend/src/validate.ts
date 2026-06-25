import { z } from 'zod'

export const registerSchema = z.object({
  token: z.string().min(1).max(100),
  displayName: z.string().max(100).optional(),
})

export const createRoomSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  invite_hash: z.string().max(100).optional(),
})

export const joinRoomSchema = z.object({
  invite_hash: z.string().max(100).optional(),
})

export const sendMessageSchema = z.object({
  message: z.string().min(1).max(50000),
})

export const renameRoomSchema = z.object({
  name: z.string().min(1).max(200),
})

export const translateSchema = z.object({
  texts: z.array(z.string().max(50000)).min(1).max(100),
  target: z.string().min(2).max(10),
})

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(data)
  if (!result.success) {
    return { ok: false, error: result.error.issues.map(e => e.message).join(', ') }
  }
  return { ok: true, data: result.data }
}

export function validateLimit(value: string | undefined, defaultVal: number, max: number): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return defaultVal
  return Math.min(n, max)
}
