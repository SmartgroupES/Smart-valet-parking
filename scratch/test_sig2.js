const crypto = require('crypto');
const header = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
const payload = 'eyJpZCI6MSwibmFtZSI6Ik5FTFNPTiBDQVJSSUxMTyIsInJvbGUiOiJkaXJlY3RvciIsImlzX3N1cGVyYWRtaW4iOnRydWUsImV4cCI6MTc4MDIyNTkyN30';
const secret1 = 'p8X3mA9qL7sT2vB4yZ6rN1kF0wH9cQ5d';
const secret2 = 'secret';

function sign(secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(header + '.' + payload);
  return hmac.digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

console.log('Sig with secret1:', sign(secret1));
console.log('Sig with secret2:', sign(secret2));
console.log('Actual sig      :', 'obZfcKF7DwGRJUSiYwaKVC96AcfRWCSJ9qEm07HxuKE');
