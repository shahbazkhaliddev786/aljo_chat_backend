import { body } from 'express-validator'

export const registerValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 100 })
    .withMessage('Name must be at most 100 characters'),
  body('email').trim().isEmail().withMessage('Valid email is required').isLength({ max: 255 }),
  body('password').isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters long')
]

export const loginValidation = [
  body('email').trim().isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
]

export const refreshTokenValidation = [body('refreshToken').notEmpty().withMessage('Refresh token is required')]

export const updateProfileValidation = [
  body('name').optional().trim().notEmpty().isLength({ max: 100 }).withMessage('Name must be 1-100 characters'),
  body('bio').optional().isString().isLength({ max: 500 }).withMessage('Bio must be at most 500 characters')
]
