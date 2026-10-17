// One place that decides how we connect to PostgreSQL (used by the app and the scripts).
// DATABASE_SSL=true encrypts the connection. rejectUnauthorized:false accepts the host's
// certificate without checking its chain: traffic is encrypted, but the server's identity is not
// verified. That is the usual setting for free cloud databases; tighten it later if the host
// gives you its CA certificate.
module.exports = function pgConfig() {
  return {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  };
};
