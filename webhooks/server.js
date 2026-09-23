const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Optional HTTP server for Telegram webhook + health check.
 * When USE_WEBHOOK=false, bot uses long polling and this is not started
 * unless you still want a health endpoint.
 */
function createWebhookServer(bot) {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'trustwallet-telegram-bot', currency: config.app.currency });
  });

  if (config.webhook.useWebhook && config.webhook.domain) {
    const path = config.webhook.path;
    app.use(bot.webhookCallback(path));
    logger.info(`[webhook] Listening for Telegram at ${path}`);
  }

  return app;
}

async function startWebhookMode(bot) {
  const app = createWebhookServer(bot);
  const port = config.webhook.port;
  const domain = config.webhook.domain.replace(/\/$/, '');
  const path = config.webhook.path;
  const url = `${domain}${path}`;

  await bot.telegram.setWebhook(url);
  logger.info(`[webhook] setWebhook → ${url}`);

  app.listen(port, () => {
    logger.info(`[webhook] HTTP server on :${port}`);
  });
}

module.exports = { createWebhookServer, startWebhookMode };
