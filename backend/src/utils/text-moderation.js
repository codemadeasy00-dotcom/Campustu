const { profanityCheck } = require('profanity-guard');
const { AppError } = require('./errors');

const SUPPORTED_SCRIPTS = [
  'Arabic',
  'Cyrillic',
  'Devanagari',
  'Han',
  'Hangul',
  'Latin',
];

const supportedScriptPattern = new RegExp(
  `^[\\p{Script=${SUPPORTED_SCRIPTS.join('}\\p{Script=')}}]$`,
  'u',
);

function assertTextIsAllowed(value) {
  if (typeof value !== 'string' || value.length === 0) return;

  const normalized = value.normalize('NFKC');
  for (const character of normalized) {
    if (/\p{Letter}/u.test(character) && !supportedScriptPattern.test(character)) {
      throw new AppError(
        400,
        'This text uses a writing system that is not currently supported by content screening.',
        'TEXT_LANGUAGE_UNSUPPORTED',
      );
    }
  }

  if (profanityCheck(normalized, 'all')) {
    throw new AppError(
      400,
      'Please remove explicit or abusive language from this text.',
      'TEXT_CONTENT_REJECTED',
    );
  }
}

function assertUserTextIsAllowed(values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      assertUserTextIsAllowed(value);
    } else {
      assertTextIsAllowed(value);
    }
  }
}

module.exports = { assertTextIsAllowed, assertUserTextIsAllowed };
