import http from 'node:http';
import { createApp } from './app';
import { config } from './config';

const app = createApp();
const server = http.createServer(app);

server.listen(config.port, () => {
  console.log(
    `Nimbus API listening on http://localhost:${config.port} (${config.nodeEnv})`,
  );
});
