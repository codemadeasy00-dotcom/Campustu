const test = require('node:test');
const assert = require('node:assert/strict');
const { hashAdminPassword, verifyAdminPassword } = require('../src/utils/admin-auth');

test('admin passwords are salted and verified without storing plaintext', async () => {
  const password = 'C@mpustu-Admin-Password-2026';
  const firstHash = await hashAdminPassword(password);
  const secondHash = await hashAdminPassword(password);

  assert.match(firstHash, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
  assert.notEqual(firstHash, secondHash);
  assert.equal(firstHash.includes(password), false);
  assert.equal(await verifyAdminPassword(password, firstHash), true);
  assert.equal(await verifyAdminPassword('Wrong-password-2026!', firstHash), false);
  assert.equal(await verifyAdminPassword(password, 'invalid-hash'), false);
});
