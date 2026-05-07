/**
 * Lightweight structured logger — no external dependencies.
 * Wraps console.* with a consistent format: [context] message {meta}.
 * Importable in server code and tests (no Next.js or DB dependencies).
 */

function format(context: string, message: string, meta?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const metaPart = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} [${context}] ${message}${metaPart}`;
}

export const logger = {
  debug(context: string, message: string, meta?: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(format(context, message, meta));
    }
  },
  info(context: string, message: string, meta?: Record<string, unknown>): void {
    console.log(format(context, message, meta));
  },
  warn(context: string, message: string, meta?: Record<string, unknown>): void {
    console.warn(format(context, message, meta));
  },
  error(context: string, message: string, meta?: Record<string, unknown>): void {
    console.error(format(context, message, meta));
  },
};

/** Returns a context-bound logger to avoid repeating the context string. */
export function createLogger(context: string) {
  return {
    debug: (message: string, meta?: Record<string, unknown>) => logger.debug(context, message, meta),
    info:  (message: string, meta?: Record<string, unknown>) => logger.info(context, message, meta),
    warn:  (message: string, meta?: Record<string, unknown>) => logger.warn(context, message, meta),
    error: (message: string, meta?: Record<string, unknown>) => logger.error(context, message, meta),
  };
}
