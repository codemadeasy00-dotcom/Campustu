const test = require('node:test');
const assert = require('node:assert/strict');
const { ITEM_BADGES, USER_BADGES, applyBadgeOverrides, buildUserBadges } = require('../src/utils/user-badges');

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

test('admin badge overrides can force a badge on or off without changing eligibility data', () => {
  const overridden = buildUserBadges({
    ...verifiedStudent,
    email_verified_at: null,
    role: 'student',
    completed_handovers: 0,
    pending_reports_received: 2,
  }, [
    { badge_id: 'college_verified', enabled: true },
    { badge_id: 'power_trader', enabled: false },
  ]).map(({ id }) => id);
  assert.ok(overridden.includes('college_verified'));
  assert.ok(!overridden.includes('power_trader'));

  const unknownOverride = applyBadgeOverrides([], [
    { badge_id: 'not_a_badge', enabled: true },
  ], USER_BADGES);
  assert.deepEqual(unknownOverride, []);
});

test('post badge overrides can replace automatic and lifecycle badges', () => {
  const badges = applyBadgeOverrides([
    { id: 'under_review', label: 'Under Moderation Review' },
    { id: 'urgent', label: 'Urgent' },
  ], [
    { badge_id: 'under_review', enabled: false },
    { badge_id: 'urgent', enabled: false },
    { badge_id: 'verified_match', enabled: true },
    { badge_id: 'claimed_resolved', enabled: true },
  ], ITEM_BADGES.lost_found_item);

  assert.deepEqual(badges.map(({ id }) => id), ['verified_match', 'claimed_resolved']);
});
