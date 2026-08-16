import { v2 as cloudinary } from 'cloudinary'
import DatauriParser from 'datauri/parser.js'
import path from 'path'
import config from '../config/config.js'
import logger from './logger.js'

cloudinary.config({
  cloud_name: config.CLOUDINARY.CLOUD_NAME,
  api_key: config.CLOUDINARY.API_KEY,
  api_secret: config.CLOUDINARY.API_SECRET
})

const parser = new DatauriParser()

export const uploadToCloudinary = async (file: Express.Multer.File, folder = 'aljo-chat') => {
  try {
    const extName = path.extname(file.originalname).toString()
    const file64 = parser.format(extName, file.buffer)

    if (!file64.content) {
      throw new Error('Failed to format file buffer')
    }

    const result = await cloudinary.uploader.upload(file64.content, {
      folder,
      resource_type: 'auto'
    })

    return result.secure_url
  } catch (error: any) {
    logger.error('Cloudinary Upload Failed', { error: error.message })
    throw error
  }
}

export default cloudinary
