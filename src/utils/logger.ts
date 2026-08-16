import util from 'util'
import path from 'path'
import { fileURLToPath } from 'url'
import { createLogger, format, transports } from 'winston'
import { red, blue, yellow, green, magenta } from 'colorette'
import * as sourceMapSupport from 'source-map-support'
import config from '../config/config.js'

sourceMapSupport.install()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const colorizeLevel = (level: string) => {
  switch (level.toUpperCase()) {
    case 'ERROR':
      return red(level)
    case 'INFO':
      return blue(level)
    case 'WARN':
      return yellow(level)
    default:
      return level
  }
}

const consoleLogFormat = format.printf((info) => {
  const { level, message, timestamp } = info as { level: string; message: string; timestamp: string }
  const meta = { ...info, level: undefined, message: undefined, timestamp: undefined }

  const customLevel = colorizeLevel(level.toUpperCase())
  const customTimestamp = green(timestamp || new Date().toISOString())

  const customMeta = util.inspect(meta, { showHidden: false, depth: null, colors: true })

  return `${customLevel} [${customTimestamp}] ${message}\n${magenta('META')} ${customMeta}\n`
})

const fileLogFormat = format.printf(({ level, message, timestamp, ...meta }) => {
  return JSON.stringify(
    {
      level: level.toUpperCase(),
      message,
      timestamp,
      meta
    },
    null,
    2
  )
})

const fileTransport = () => {
  if (process.env.VERCEL) return []
  return [
    new transports.File({
      filename: path.join(__dirname, '../../logs', `${config.ENV}.log`),
      level: 'info',
      format: format.combine(format.timestamp(), fileLogFormat)
    })
  ]
}

export const logger = createLogger({
  defaultMeta: { meta: {} },
  transports: [
    ...fileTransport(),
    new transports.Console({
      level: 'info',
      format: format.combine(format.timestamp(), consoleLogFormat)
    })
  ]
})

export default logger
