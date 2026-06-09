type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

function formatEntry(entry: LogEntry): string {
  const ctx = entry.context ? ' | ' + JSON.stringify(entry.context) : '';
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${ctx}`;
}

function createLogger() {
  const isDev = process.env.NODE_ENV !== 'production';
  const configuredLevel =
    (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || (isDev ? 'debug' : 'info');

  function shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[configuredLevel];
  }

  function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    const formatted = formatEntry(entry);

    if (isDev) {
      switch (level) {
        case 'error':
          console.error(formatted);
          break;
        case 'warn':
          console.warn(formatted);
          break;
        default:
          console.log(formatted);
      }
    } else {
      console.log(JSON.stringify(entry));
    }
  }

  return {
    debug: (msg: string, ctx?: Record<string, unknown>) => log('debug', msg, ctx),
    info: (msg: string, ctx?: Record<string, unknown>) => log('info', msg, ctx),
    warn: (msg: string, ctx?: Record<string, unknown>) => log('warn', msg, ctx),
    error: (msg: string, err?: unknown, ctx?: Record<string, unknown>) => {
      const errorCtx =
        err instanceof Error
          ? {
              ...ctx,
              errorMessage: err.message,
              stack: err.stack?.split('\n').slice(0, 3).join(' | '),
            }
          : ctx;
      log('error', msg, errorCtx);
    },
  };
}

export const logger = createLogger();
