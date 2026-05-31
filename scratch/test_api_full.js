const fs = require('fs');
fetch('https://eye-staff.app/api/sessions/active')
  .then(res => res.json())
  .then(data => {
    const s83 = data.sessions.find(s => s.id === 83);
    console.log(JSON.stringify(s83, null, 2));
  })
  .catch(console.error);
