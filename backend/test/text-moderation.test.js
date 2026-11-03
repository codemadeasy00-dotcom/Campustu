const test = require('node:test');
const assert = require('node:assert/strict');
const { AppError } = require('../src/utils/errors');
const { assertTextIsAllowed, assertUserTextIsAllowed } = require('../src/utils/text-moderation');

test('allows clean text in supported languages and across nested user fields', () => {
  assert.doesNotThrow(() => assertTextIsAllowed('Lost my blue notebook near the library.'));
  assert.doesNotThrow(() => assertTextIsAllowed('नमस्ते, मेरी किताब खो गई है।'));
  assert.doesNotThrow(() => assertTextIsAllowed('你好，我丢了一个书包。'));
  assert.doesNotThrow(() => assertUserTextIsAllowed(['A clean title', ['A clean message']]));
});

test('rejects explicit wording and unsupported writing systems', () => {
  assert.throws(() => assertTextIsAllowed('This is bullsh!t.'), (error) => (
    error instanceof AppError && error.code === 'TEXT_CONTENT_REJECTED'
  ));
  assert.throws(() => assertTextIsAllowed('Καλημέρα'), (error) => (
    error instanceof AppError && error.code === 'TEXT_LANGUAGE_UNSUPPORTED'
  ));
});

test('rejects explicit wording from multiple supported language dictionaries', () => {
  const examples = [
    '¡vete a la mierda, campero!',
    'आंड़',
    '草泥马',
    'اعور',
    '이 개새끼야!',
    'прекрати это, бл**ь',
    "C'est de la m*rde",
    'Das ist absolute scheiße!',
    'vai pro c*ralho',
  ];

  for (const example of examples) {
    assert.throws(() => assertTextIsAllowed(example), (error) => (
      error instanceof AppError && error.code === 'TEXT_CONTENT_REJECTED'
    ), `Expected moderation to reject: ${example}`);
  }
});
