import multer from 'multer'
import type { Request } from 'express'
import { badRequest } from '../utils/app-error.js'

const storage = multer.memoryStorage()

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const ATTACHMENT_TYPES = [
  ...IMAGE_TYPES,
  'application/pdf',
  'text/plain',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'audio/mpeg',
  'audio/ogg',
  'audio/webm',
  'audio/wav',
  'video/mp4',
  'video/webm',
  // End-to-end encrypted attachments are uploaded as opaque ciphertext.
  'application/octet-stream'
]

const allow = (types: string[]) => (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (types.includes(file.mimetype)) cb(null, true)
  else cb(badRequest('This file type is not allowed'))
}

export const uploadSingleFile = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: allow(ATTACHMENT_TYPES)
}).single('file')

export const uploadAvatar = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: allow(IMAGE_TYPES)
}).single('avatar')
