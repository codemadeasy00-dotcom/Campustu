const fs = require('fs');
require('dotenv').config();
const { Client } = require('pg');
const config = require('./config');
const storage = require('./storage');
const { pool } = require('./db');
const app = require('./app');
const { migrate } = require('../scripts/migrate');

if (!storage.useS3) fs.mkdirSync(storage.root, { recursive: true });

const PORT = config.port || process.env.PORT || 4000;

async function ensureDatabaseReady() {
  const client = new Client(require('./dbConfig')());
  await client.connect();
  try {
    await migrate(client);
  } finally {
    await client.end();
  }
}

let server;

async function startServer() {
  try {
    await ensureDatabaseReady();
    server = app.listen(PORT, () => {
      console.log(`CampusKit API listening on port ${PORT} (${config.env || 'development'})`);
    });

    const collegeRoutes = require('./routes/colleges');
    app.use('/api/colleges', collegeRoutes);
  } catch (error) {
    console.error('Database startup check failed:', error.message);
    process.exit(1);
  }
}

function shutdown() {
  if (!server) return;
  server.close(() => pool.end().then(() => process.exit(0)));
}

startServer();
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);