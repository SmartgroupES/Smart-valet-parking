const fs = require('fs');
fetch('https://eye-staff.app/api/sessions/active')
  .then(res => res.json())
  .then(data => {
    const s83 = data.sessions.find(s => s.id === 83);
    const s91 = data.sessions.find(s => s.id === 91);
    console.log('Session 83:', s83.name, 'Type:', s83.type);
    console.log('Session 91:', s91.name, 'Type:', s91.type);
  })
  .catch(console.error);
