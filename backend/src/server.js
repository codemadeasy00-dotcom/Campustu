const fs = require('fs');
const config = require('./config');
const storage = require('./storage');
const { pool } = require('./db');
const app = require('./app');

if (!storage.useS3) fs.mkdirSync(storage.root, { recursive: true });

const server = app.listen(config.port, () => {
  console.log(`CampusKit API listening on port ${config.port} (${config.env})`);
});

function shutdown() {
  server.close(() => pool.end().then(() => process.exit(0)));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
