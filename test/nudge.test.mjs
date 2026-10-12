import test from 'node:test';
import assert from 'node:assert/strict';
import { nudgeText, pushText } from '../api/duo-notify.js';

test('a nudge is one fixed line, with the sender\'s name the only free text', () => {
  assert.equal(nudgeText('Maya'), 'Maya nudged you. Confirm your meal on Bento.');
  assert.equal(nudgeText('  '), 'A buddy nudged you. Confirm your meal on Bento.');
  assert.equal(nudgeText('Sam\n  Lee'), 'Sam Lee nudged you. Confirm your meal on Bento.');      // line breaks collapse
  assert.equal(pushText('Maya', 'Usdan'), 'Maya is at Usdan');                                    // the I'm here line is unchanged
});
