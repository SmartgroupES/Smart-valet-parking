const jwt = require('jsonwebtoken'); // Assuming jsonwebtoken is installed, or we can use node crypto
try {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwibmFtZSI6Ik5FTFNPTiBDQVJSSUxMTyIsInJvbGUiOiJkaXJlY3RvciIsImlzX3N1cGVyYWRtaW4iOnRydWUsImV4cCI6MTc4MDIyNTA5M30.rm0ZjHuDuKVXr7OMzhxPq03yfW1xmNhaYnmzRzAiEm8';
  const secret = 'p8X3mA9qL7sT2vB4yZ6rN1kF0wH9cQ5d';
  const decoded = jwt.verify(token, secret);
  console.log('Decoded:', decoded);
} catch (e) {
  console.error('Error:', e.message);
  try {
     const decodedFallback = jwt.verify(token, 'secret');
     console.log('Decoded with fallback:', decodedFallback);
  } catch(e2) {
     console.error('Error fallback:', e2.message);
  }
}
