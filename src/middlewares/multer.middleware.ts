import multer from 'multer'

const storage = multer.memoryStorage()

export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
})

export const uploadSingleFile = upload.single('file')
export const uploadAvatar = upload.single('avatar')
