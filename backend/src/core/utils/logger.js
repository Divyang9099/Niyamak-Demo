/**
 * Lightweight structured logger.
 *
 * Production (NODE_ENV=production): emits one JSON object per line to
 *   stdout/stderr — directly ingestible by Loki/CloudWatch/Datadog/ELK, with a
 *   timestamp, level, message and any structured metadata.
 * Development: human-readable, colour/emoji-tagged console output.
 *
 * No external dependency. If you later want pino/winston, the call sites
 * (logger.info/warn/error/debug) stay the same.
 */

const isProd = process.env.NODE_ENV === 'production';
const SERVICE = 'varuna-ops-api';

// Normalise extra args into a single metadata object when possible.
const toMeta = (args) => {
  if (!args.length) return undefined;
  if (args.length === 1 && args[0] && typeof args[0] === 'object' && !(args[0] instanceof Error)) {
    return args[0];
  }
  // Mixed/scalar args (incl. error stacks) — keep them as an array.
  return { extra: args.map(a => (a instanceof Error ? { message: a.message, stack: a.stack } : a)) };
};

const emit = (level, stream, msg, args) => {
  if (isProd) {
    const record = { ts: new Date().toISOString(), level, service: SERVICE, msg: String(msg) };
    const meta = toMeta(args);
    if (meta) Object.assign(record, meta);
    stream(JSON.stringify(record));
  } else {
    const tag = { info: 'ℹ️  [INFO] ', warn: '⚠️  [WARN] ', error: '❌ [ERROR]', debug: '🐛 [DEBUG]' }[level];
    stream(`${tag} ${msg}`, ...args);
  }
};

const logger = {
  info:  (msg, ...args) => emit('info',  console.log,   msg, args),
  warn:  (msg, ...args) => emit('warn',  console.warn,  msg, args),
  error: (msg, ...args) => emit('error', console.error, msg, args),
  debug: (msg, ...args) => { if (!isProd) emit('debug', console.log, msg, args); },
};

module.exports = logger;
