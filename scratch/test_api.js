const jwt = require('jsonwebtoken');
const token = jwt.sign({ id: 1, role: 'director', name: 'Admin', is_superadmin: true }, 'secret');
console.log(token);
fetch('https://eye-staff.app/api/sessions/active', {
  headers: { 'Authorization': 'Bearer ' + token }
}).then(r => r.text()).then(console.log).catch(console.error);
