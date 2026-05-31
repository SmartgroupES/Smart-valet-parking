import { sign, verify } from 'hono/jwt'
async function run() {
  const secret = 'p8X3mA9qL7sT2vB4yZ6rN1kF0wH9cQ5d';
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwibmFtZSI6Ik5FTFNPTiBDQVJSSUxMTyIsInJvbGUiOiJkaXJlY3RvciIsImlzX3N1cGVyYWRtaW4iOnRydWUsImV4cCI6MTc4MDIyNTA5M30.rm0ZjHuDuKVXr7OMzhxPq03yfW1xmNhaYnmzRzAiEm8';
  try {
     const payload = await verify(token, secret, 'HS256');
     console.log('Verified:', payload);
  } catch(e) {
     console.log('Verify Error:', e.message);
  }
}
run();
