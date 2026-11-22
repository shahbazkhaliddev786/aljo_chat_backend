/**
 * An error that is safe to show to the client, with its HTTP status.
 * Anything that is *not* an AppError is treated as an internal error: it is
 * logged in full but the client only sees a generic message.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const badRequest = (message: string, code?: string) => new AppError(400, message, code)
export const unauthorized = (message = 'Authentication required', code?: string) => new AppError(401, message, code)
export const forbidden = (message = 'Access denied', code?: string) => new AppError(403, message, code)
export const notFound = (message = 'Not found', code?: string) => new AppError(404, message, code)
export const conflict = (message: string, code?: string) => new AppError(409, message, code)
export const tooManyRequests = (message = 'Too many requests. Please slow down.') =>
  new AppError(429, message, 'rate-limited')

const GENERIC_MESSAGE = 'Something went wrong. Please try again.'

/** Message that may be sent to a client for any thrown value. */
export const publicErrorMessage = (err: unknown): string => (err instanceof AppError ? err.message : GENERIC_MESSAGE)
