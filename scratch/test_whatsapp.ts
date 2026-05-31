import { sanitizeWhatsAppNumber } from '../src/index';

function testSanitization() {
  const tests = [
    // US Cases
    { input: '+1 (786) 252-7353', expected: '17862527353' },
    { input: '17862527353', expected: '17862527353' },
    { input: '7862527353', expected: '17862527353' },
    
    // Spain Cases
    { input: '+34 612 34 56 78', expected: '34612345678' },
    { input: '612345678', expected: '34612345678' },
    { input: '34612345678', expected: '34612345678' },
    { input: '712345678', expected: '34712345678' },

    // Venezuela Cases
    { input: '04121234567', expected: '584121234567' },
    { input: '4241234567', expected: '584241234567' },
    { input: '584121234567', expected: '584121234567' },

    // Invalid Case
    { input: '9999999', expected: null },
  ];

  let passed = true;
  for (const t of tests) {
    const output = sanitizeWhatsAppNumber(t.input);
    if (output === t.expected) {
      console.log(`✅ PASSED: ${t.input} -> ${output}`);
    } else {
      console.error(`❌ FAILED: ${t.input} -> Expected: ${t.expected}, Got: ${output}`);
      passed = false;
    }
  }

  if (passed) {
    console.log('\n✨ ALL TESTS PASSED SUCCESSFULLY! ✨');
    process.exit(0);
  } else {
    console.error('\n❌ SOME TESTS FAILED! ❌');
    process.exit(1);
  }
}

testSanitization();
