const test = require('node:test');
const assert = require('node:assert/strict');
const { buildUserBadges } = require('../src/utils/user-badges');

const verifiedStudent = {
  email: 'student@dbatu.ac.in',
  email_domain: 'dbatu.ac.in',
  email_verified_at: '2026-01-01T00:00:00Z',
  college_status: 'approved',
  role: 'student',
  status: 'active',
  completed_handovers: 2,
  pending_reports_received: 0,
};

test('college verification and Power Trader require their full eligibility conditions', () => {
  const badgeIds = buildUserBadges(verifiedStudent).map(({ id }) => id);
  assert.ok(badgeIds.includes('college_verified'));
  assert.ok(badgeIds.includes('power_trader'));

  const reportedStudent = buildUserBadges({
    ...verifiedStudent,
    pending_reports_received: 1,
  }).map(({ id }) => id);
  assert.ok(!reportedStudent.includes('power_trader'));

  const unverifiedStudent = buildUserBadges({
    ...verifiedStudent,
    email_verified_at: null,
  }).map(({ id }) => id);
  assert.ok(!unverifiedStudent.includes('college_verified'));
});

test('staff and account status badges reflect the actual account role and state', () => {
  const badgeIds = buildUserBadges({
    ...verifiedStudent,
    role: 'admin',
    status: 'banned',
    completed_handovers: 0,
  }).map(({ id }) => id);
  assert.ok(badgeIds.includes('admin'));
  assert.ok(badgeIds.includes('banned'));
  assert.ok(!badgeIds.includes('power_trader'));
});
