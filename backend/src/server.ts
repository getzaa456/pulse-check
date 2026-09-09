import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { Database } from './db.js';

const config = loadConfig();
const db = new Database(config.DATABASE_URL);

await db.migrate();

const server = createApp(db, config).listen(config.APP_PORT, config.APP_HOST, () => {
  console.log(`Pulse Check API listening on http://${config.APP_HOST}:${config.APP_PORT}`);
});

async function shutdown() {
  server.close();
  await db.close();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
