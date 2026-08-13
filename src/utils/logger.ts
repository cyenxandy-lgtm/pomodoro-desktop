export interface Logger {
  debug(message: string, context?: unknown): void
  info(message: string, context?: unknown): void
  warn(message: string, context?: unknown): void
  error(message: string, context?: unknown): void
}

const write = (
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: unknown,
): void => {
  if (!import.meta.env.DEV && (level === 'debug' || level === 'info')) return
  if (context === undefined) {
    console[level](`[Pomodoro] ${message}`)
    return
  }
  console[level](`[Pomodoro] ${message}`, context)
}

export const logger: Logger = {
  debug: (message, context) => write('debug', message, context),
  info: (message, context) => write('info', message, context),
  warn: (message, context) => write('warn', message, context),
  error: (message, context) => write('error', message, context),
}
