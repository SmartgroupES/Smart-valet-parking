const jwt = require('jsonwebtoken');

const token = jwt.sign(
    { id: 1000, name: 'Admin', role: 'admin' }, 
    'p8X3mA9qL7sT2vB4yZ6rN1kF0wH9cQ5d'
);

fetch('https://eye-staff.app/api/admin/payroll/close-cycle', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ user_id: 1000 })
})
.then(res => res.text())
.then(text => console.log('RESPONSE:', text))
.catch(console.error);
