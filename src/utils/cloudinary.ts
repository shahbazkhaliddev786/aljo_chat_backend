import { v2 as cloudinary } from 'cloudinary'
import config from '../config/config.js'
import logger from './logger.js'

cloudinary.config({
  cloud_name: config.CLOUDINARY.CLOUD_NAME,
  api_key: config.CLOUDINARY.API_KEY,
  api_secret: config.CLOUDINARY.API_SECRET
})

/** Stream an uploaded file to Cloudinary (no base64 copy of the whole file in memory). */
export const uploadToCloudinary = (file: Express.Multer.File, folder = 'aljo-chat'): Promise<string> =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder, resource_type: 'auto' }, (error, result) => {
      if (error || !result) {
        logger.error('Cloudinary Upload Failed', { meta: { error: error?.message } })
        return reject(error || new Error('Upload failed'))
      }
      resolve(result.secure_url)
    })
    stream.end(file.buffer)
  })

export default cloudinary
