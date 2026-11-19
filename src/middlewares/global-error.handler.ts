import type { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { AppError } from '../utils/app-error.js'
import logger from '../utils/logger.js'

/** Postgres error codes that are caused by bad input rather than a server fault. */
const PG_CLIENT_ERRORS: Record<string, { status: number; message: string }> = {
  '22P02': { status: 400, message: 'Invalid identifier' }, // invalid_text_representation (e.g. bad uuid)
  '23503': { status: 400, message: 'Referenced record does not exist' }, // foreign_key_violation
  '23505': { status: 409, message: 'Already exists' } // unique_violation
}

const pgCode = (err: any): string | undefined => err?.code ?? err?.cause?.code

export const globalErrorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  let status = 500
  let message = 'Internal Server Error'
  let code: string | undefined

  if (err instanceof AppError) {
    status = err.statusCode
    message = err.message
    code = err.code
  } else if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : 'Invalid file upload'
  } else if (err?.type === 'entity.too.large') {
    status = 413
    message = 'Request body is too large'
  } else if (err?.type === 'entity.parse.failed') {
    status = 400
    message = 'Malformed JSON body'
  } else if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) {
    // 4xx raised by middleware (e.g. static files not found)
    status = err.status
    message = status === 404 ? 'Not found' : 'Request failed'
  } else if (pgCode(err) && PG_CLIENT_ERRORS[pgCode(err)!]) {
    ;({ status, message } = PG_CLIENT_ERRORS[pgCode(err)!])
  }

  if (status >= 500) {
    logger.error(`[ERROR] ${req.method} ${req.path}`, { meta: { message: err?.message, stack: err?.stack } })
  } else {
    logger.warn(`[${status}] ${req.method} ${req.path}`, { meta: { message: err?.message } })
  }

  res.status(status).json({ status: 'error', message, ...(code ? { code } : {}) })
}

export default globalErrorHandler
