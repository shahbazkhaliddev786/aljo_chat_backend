import type { Request, Response, NextFunction } from 'express'
import logger from '../utils/logger.js'

export const globalErrorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error(`[ERROR] ${req.method} ${req.path}:`, { meta: { message: err.message, stack: err.stack } })
  res.status(500).json({
    status: 'error',
    message: err.message || 'Internal Server Error'
  })
}

export default globalErrorHandler
