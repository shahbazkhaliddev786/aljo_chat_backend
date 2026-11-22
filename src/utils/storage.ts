import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import config from '../config/config.js'
import { uploadToCloudinary } from './cloudinary.js'
import logger from './logger.js'

export const LOCAL_UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads')

const cloudinaryConfigured = () =>
  !!(config.CLOUDINARY.CLOUD_NAME && config.CLOUDINARY.API_KEY && config.CLOUDINARY.API_SECRET)

let warned = false

/**
 * Store an uploaded file and return its public URL. Uses Cloudinary when it is
 * configured; otherwise files are written to a local directory (development).
 * Encrypted attachments are opaque blobs either way.
 */
export const uploadFile = async (file: Express.Multer.File, folder: string): Promise<string> => {
  if (cloudinaryConfigured()) return uploadToCloudinary(file, folder)

  if (!warned && config.ENV === 'production') {
    warned = true
    logger.warn('LOCAL_FILE_STORAGE_IN_PRODUCTION', {
      meta: { message: 'Cloudinary is not configured; uploads are stored on local disk.' }
    })
  }

  // Random names only: never trust the client's file name or extension for the path.
  const ext = file.mimetype.startsWith('image/') ? `.${file.mimetype.split('/')[1].replace(/[^a-z0-9]/g, '')}` : ''
  const name = `${randomUUID()}${ext}`
  await fs.mkdir(LOCAL_UPLOAD_DIR, { recursive: true })
  await fs.writeFile(path.join(LOCAL_UPLOAD_DIR, name), file.buffer)
  return `${config.SERVER_URL}/uploads/${name}`
}
