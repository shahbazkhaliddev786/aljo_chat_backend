import { param } from 'express-validator'

/** Route parameter must be a UUID (avoids database errors and 500s on garbage ids). */
export const uuidParam = (name: string) => param(name).isUUID().withMessage(`Valid ${name} is required`)
