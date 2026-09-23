const winston = require('winston');
const config = require('../config');

const logger = winston.createLogger({
  level: config.app.env === 'development' ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      return stack
        ? `${timestamp} [${level}] ${message}\n${stack}`
        : `${timestamp} [${level}] ${message}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

module.exports = logger;
