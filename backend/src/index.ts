import http from 'node:http';
import { createApp } from './app';
import { config } from './config';
import { logger } from './logger';
import { initSocket } from './realtime/socket';

const app = createApp();
const server = http.createServer(app);
initSocket(server);

server.listen(config.port, () => {
  logger.info(
    { event: 'server.start', port: config.port, env: config.nodeEnv },
    `Nimbus API listening on http://localhost:${config.port}`,
  );
});
