const config = require('../config');
const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const cur = levels[config.logLevel] ?? 2;

function log(level, ...args) {
  if ((levels[level] ?? 2) <= cur) {
    const ts = new Date().toISOString();
    const fn = level === 'error' ? console.error : console.log;
    fn(`[${ts}] [${level.toUpperCase()}]`, ...args);
  }
}

module.exports = {
  logger: {
    error: (...a) => log('error', ...a),
    warn: (...a) => log('warn', ...a),
    info: (...a) => log('info', ...a),
    debug: (...a) => log('debug', ...a),
  },
};
