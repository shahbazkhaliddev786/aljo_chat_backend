import nodemailer from 'nodemailer'
import config from '../config/config.js'
import logger from './logger.js'

const transporter = nodemailer.createTransport({
  host: config.SMTP.HOST,
  port: config.SMTP.PORT,
  secure: config.SMTP.PORT === 465,
  auth: {
    user: config.SMTP.USER,
    pass: config.SMTP.PASS
  }
})

export const sendEmail = async ({ to, subject, html }: { to: string; subject: string; html: string }) => {
  try {
    const info = await transporter.sendMail({
      from: config.SMTP.FROM,
      to,
      subject,
      html
    })
    logger.info('EMAIL_SENT', { meta: { messageId: info.messageId, recipient: to } })
    return info
  } catch (error: any) {
    logger.error('EMAIL_SEND_FAILED', { meta: { error: error.message, recipient: to } })
    throw error
  }
}
