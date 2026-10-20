const fs = require('fs');
require('dotenv').config();
const config = require('./config');
const storage = require('./storage');
const { pool } = require('./db');
const app = require('./app');

if (!storage.useS3) fs.mkdirSync(storage.root, { recursive: true });

const PORT = config.port || process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`CampusKit API listening on port ${PORT} (${config.env || 'development'})`);
});

const collegeRoutes = require('./routes/colleges');
app.use('/api/colleges', collegeRoutes);

function shutdown() {
  server.close(() => pool.end().then(() => process.exit(0)));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);