import nodemailer from 'nodemailer'
import config from '../config/config.js'
import logger from './logger.js'

/**
 * Without SMTP credentials (local development), emails are not sent but
 * written to the log so links can still be followed.
 */
const smtpConfigured = !!(config.SMTP.USER && config.SMTP.PASS)

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: config.SMTP.HOST,
      port: config.SMTP.PORT,
      secure: config.SMTP.PORT === 465,
      auth: { user: config.SMTP.USER, pass: config.SMTP.PASS }
    })
  : nodemailer.createTransport({ jsonTransport: true })

export const sendEmail = async ({
  to,
  subject,
  html,
  text
}: {
  to: string
  subject: string
  html: string
  text?: string
}) => {
  try {
    const info = await transporter.sendMail({ from: config.SMTP.FROM, to, subject, html, text })
    if (smtpConfigured) {
      logger.info('EMAIL_SENT', { meta: { messageId: info.messageId, recipient: to } })
    } else {
      logger.warn('EMAIL_NOT_SENT_SMTP_NOT_CONFIGURED', { meta: { recipient: to, subject, text } })
    }
    return info
  } catch (error: any) {
    logger.error('EMAIL_SEND_FAILED', { meta: { error: error.message, recipient: to } })
    throw error
  }
}
