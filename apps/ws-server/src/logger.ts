type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const isProduction = process.env.NODE_ENV === 'production';
const configuredLevel =
  (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || (isProduction ? 'info' : 'debug');

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[configuredLevel];
}

function formatLog(level: LogLevel, message: string, extra?: unknown) {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  if (extra instanceof Error) {
    entry.error = extra.message;
    // Include first 3 lines of stack for debugging
    entry.stack = extra.stack?.split('\n').slice(0, 3).join('\n');
  } else if (extra && typeof extra === 'object') {
    Object.assign(entry, extra);
  }
  return isProduction
    ? JSON.stringify(entry)
    : `[${entry.timestamp}] ${level.toUpperCase()}: ${message}`;
}

export const logger = {
  debug(message: string, extra?: unknown) {
    if (shouldLog('debug')) console.log(formatLog('debug', message, extra));
  },
  info(message: string, extra?: unknown) {
    if (shouldLog('info')) console.log(formatLog('info', message, extra));
  },
  warn(message: string, extra?: unknown) {
    if (shouldLog('warn')) console.warn(formatLog('warn', message, extra));
  },
  error(message: string, err?: unknown, ctx?: Record<string, unknown>) {
    // Always log errors regardless of LOG_LEVEL
    if (err && ctx) {
      console.error(formatLog('error', message, { ...(err instanceof Error ? { error: err.message, stack: err.stack?.split('\n').slice(0, 3).join('\n') } : { error: String(err) }), ...ctx }));
    } else if (err) {
      console.error(formatLog('error', message, err));
    } else {
      console.error(formatLog('error', message));
    }
  },
};
