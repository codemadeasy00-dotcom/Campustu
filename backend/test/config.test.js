const test = require('node:test')
const assert = require('node:assert/strict')

test('production CORS allows configured frontend origins and the default Vercel origin', (t) => {
  const variables = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://campustu:test@localhost/campustu',
    DATABASE_SSL: 'true',
    JWT_SECRET: 'j'.repeat(48),
    OTP_SECRET: 'o'.repeat(48),
    SMTP_HOST: 'smtp.example.test',
    S3_BUCKET: 'campustu-test',
    S3_ACCESS_KEY_ID: 'test-access-key',
    S3_SECRET_ACCESS_KEY: 'test-secret-key',
    S3_PUBLIC_BASE_URL: 'https://storage.example.test',
    CORS_ORIGIN: 'https://campustu.example, https://preview.campustu.example',
  }
  const previous = Object.fromEntries(Object.keys(variables).map((key) => [key, process.env[key]]))
  const configPath = require.resolve('../src/config')
  t.after(() => {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    })
    delete require.cache[configPath]
  })

  Object.assign(process.env, variables)
  delete require.cache[configPath]
  const config = require('../src/config')

  assert.deepEqual(config.corsOrigins, [
    'https://campustu.example',
    'https://preview.campustu.example',
    'https://campustu.vercel.app',
  ])
})
