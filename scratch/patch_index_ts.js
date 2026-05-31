const fs = require('fs');
let ts = fs.readFileSync('src/index.ts', 'utf8');

const oldReturn = `        return c.json({
          id: dbUser.id,
          name: dbUser.name,
          role: finalRole,
          is_superadmin: finalRole === 'director',
          profile_admin: dbUser.profile_admin || 'NO APLICA',
          profile_opera: dbUser.profile_opera || 'NO APLICA',
          eye_id: dbUser.eye_id || 'N/A',
          is_guest: isGuestUser,
          web_session_id: sessionId,
          token
        });`;

const newReturn = `        return c.json({
          id: dbUser.id,
          name: dbUser.name,
          role: finalRole,
          is_superadmin: finalRole === 'director',
          profile_admin: dbUser.profile_admin || 'NO APLICA',
          profile_opera: dbUser.profile_opera || 'NO APLICA',
          eye_id: dbUser.eye_id || 'N/A',
          is_guest: isGuestUser,
          web_session_id: sessionId,
          pin_hash: dbUser.pin_hash,
          token
        });`;

if (ts.includes(oldReturn)) {
    ts = ts.replace(oldReturn, newReturn);
    fs.writeFileSync('src/index.ts', ts);
    console.log('src/index.ts patched for dbUser');
} else {
    console.log('oldReturn not found for dbUser');
}

// And for the maestro bypass:
const oldReturnMaestro = `        return c.json({
          id: 1,
          name: name.trim().toUpperCase(),
          role: 'director',
          is_superadmin: true,
          is_guest: false,
          web_session_id: Date.now().toString(),
          token
        });`;
const newReturnMaestro = `        return c.json({
          id: 1,
          name: name.trim().toUpperCase(),
          role: 'director',
          is_superadmin: true,
          is_guest: false,
          web_session_id: Date.now().toString(),
          pin_hash: lowerPass,
          token
        });`;

if (ts.includes(oldReturnMaestro)) {
    ts = ts.replace(oldReturnMaestro, newReturnMaestro);
    fs.writeFileSync('src/index.ts', ts);
    console.log('src/index.ts patched for maestro');
} else {
    console.log('oldReturnMaestro not found');
}
