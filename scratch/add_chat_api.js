const fs = require('fs');
const file = 'src/index.ts';
let code = fs.readFileSync(file, 'utf8');

const apiCode = `
// ==========================================
// CHAT INTERNAL API
// ==========================================

app.get('/api/chat/users', async (c) => {
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const user = await verifyToken(token, c.env.JWT_SECRET);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const res = await c.env.DB.prepare('SELECT id, name, role FROM users WHERE is_active=1 ORDER BY name ASC').all();
  return c.json({ users: res.results });
});

app.post('/api/chat/groups', async (c) => {
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const user = await verifyToken(token, c.env.JWT_SECRET);
  if (!user || (user.role !== 'admin' && user.role !== 'director')) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json();
  if (!body.name || !body.members || !Array.isArray(body.members)) return c.json({ error: 'Invalid payload' }, 400);

  const groupRes = await c.env.DB.prepare('INSERT INTO chat_groups (name, created_by) VALUES (?, ?) RETURNING id')
    .bind(body.name, user.id)
    .first();
  
  if (!groupRes || !groupRes.id) return c.json({ error: 'Error creating group' }, 500);

  const groupId = groupRes.id;
  const members = [...new Set([...body.members, user.id])];
  
  for (const memberId of members) {
    await c.env.DB.prepare('INSERT INTO chat_group_members (group_id, user_id) VALUES (?, ?)')
      .bind(groupId, memberId)
      .run();
  }

  return c.json({ success: true, groupId });
});

app.get('/api/chat/conversations', async (c) => {
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const user = await verifyToken(token, c.env.JWT_SECRET);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  // Get groups where the user is a member
  const groupsRes = await c.env.DB.prepare(\`
    SELECT g.id, g.name, 'group' as type
    FROM chat_groups g
    JOIN chat_group_members gm ON g.id = gm.group_id
    WHERE gm.user_id = ?
  \`).bind(user.id).all();

  // For 1-on-1, ideally we just return a list of users they've talked to, or all users.
  // The UI will probably just show all users, but let's fetch all users for now.
  const usersRes = await c.env.DB.prepare(\`
    SELECT id, name, 'user' as type
    FROM users
    WHERE is_active=1 AND id != ?
    ORDER BY name ASC
  \`).bind(user.id).all();

  return c.json({ 
    groups: groupsRes.results || [],
    users: usersRes.results || []
  });
});

app.get('/api/chat/messages', async (c) => {
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const user = await verifyToken(token, c.env.JWT_SECRET);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const recipient_id = c.req.query('user_id');
  const group_id = c.req.query('group_id');
  const session_id = c.req.query('session_id');

  let query = '';
  let params = [];

  if (group_id) {
    // verify user is in group
    const check = await c.env.DB.prepare('SELECT 1 FROM chat_group_members WHERE group_id=? AND user_id=?').bind(group_id, user.id).first();
    if (!check) return c.json({ error: 'Forbidden' }, 403);

    query = \`
      SELECT m.*, u.name as sender_name 
      FROM chat_messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.group_id = ?
      ORDER BY m.created_at ASC
    \`;
    params = [group_id];
  } else if (recipient_id) {
    query = \`
      SELECT m.*, u.name as sender_name 
      FROM chat_messages m
      JOIN users u ON m.sender_id = u.id
      WHERE (m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?)
      ORDER BY m.created_at ASC
    \`;
    params = [user.id, recipient_id, recipient_id, user.id];
  } else if (session_id) {
    query = \`
      SELECT m.*, u.name as sender_name 
      FROM chat_messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.session_id = ?
      ORDER BY m.created_at ASC
    \`;
    params = [session_id];
  } else {
    return c.json({ messages: [] });
  }

  const stmt = c.env.DB.prepare(query);
  const res = await (params.length === 1 ? stmt.bind(params[0]) : params.length === 2 ? stmt.bind(params[0], params[1]) : params.length === 4 ? stmt.bind(params[0], params[1], params[2], params[3]) : stmt).all();

  return c.json({ messages: res.results || [] });
});

app.post('/api/chat/messages', async (c) => {
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const user = await verifyToken(token, c.env.JWT_SECRET);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json();
  if (!body.message) return c.json({ error: 'Message required' }, 400);

  const recipient_id = body.recipient_id || null;
  const group_id = body.group_id || null;
  const session_id = body.session_id || null;

  if (!recipient_id && !group_id && !session_id) {
    return c.json({ error: 'Target required' }, 400);
  }

  await c.env.DB.prepare(
    'INSERT INTO chat_messages (sender_id, recipient_id, group_id, session_id, message) VALUES (?, ?, ?, ?, ?)'
  ).bind(user.id, recipient_id, group_id, session_id, body.message).run();

  return c.json({ success: true });
});

`;

if (!code.includes('/api/chat/conversations')) {
  code = code.replace('export default {', apiCode + '\nexport default {');
  fs.writeFileSync(file, code);
  console.log('Chat API endpoints added successfully!');
} else {
  console.log('Chat API endpoints already exist.');
}
