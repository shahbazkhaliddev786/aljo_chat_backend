import type { Request, Response, NextFunction } from 'express'
import { validationResult, type ValidationError } from 'express-validator'

export const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req)

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err: ValidationError) => {
      if (err.type === 'field') {
        return {
          field: err.path,
          message: err.msg,
          value: err.value,
          location: err.location
        }
      }
      return { message: err.msg }
    })

    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: formattedErrors
    })
  }

  next()
}
