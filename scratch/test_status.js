const fs = require('fs');
fetch('https://eye-staff.app/api/sessions/active')
  .then(res => res.json())
  .then(data => {
    data.sessions.forEach(s => console.log(`ID: ${s.id}, Name: ${s.name}, Status: ${s.status}`));
  })
  .catch(console.error);
