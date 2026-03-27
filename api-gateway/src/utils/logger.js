'use strict';

const winston = require('winston');
const config = require('../config');

const { combine, timestamp, json, colorize, simple, errors } = winston.format;

const productionFormat = combine(
  errors({ stack: true }),
  timestamp(),
  json()
);

const developmentFormat = combine(
  errors({ stack: true }),
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  simple()
);

const logger = winston.createLogger({
  level: config.logLevel,
  defaultMeta: { service: 'api-gateway' },
  format: config.env === 'production' ? productionFormat : developmentFormat,
  transports: [
    new winston.transports.Console(),
  ],
  exitOnError: false,
});

module.exports = logger;
