const fs = require('fs');
fetch('https://eye-staff.app/api/admin/payment-formats/events/1', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ monto: 60 })
}).then(r => r.text()).then(console.log).catch(console.error);
