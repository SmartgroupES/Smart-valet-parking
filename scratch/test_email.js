const fs = require('fs');
async function run() {
  const res = await fetch('https://eye-staff.app/api/presupuestos/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: 'eyestaff.ncarrillo@gmail.com',
      subject: 'Test subject',
      pdfData: Buffer.from('dummy pdf data').toString('base64'),
      filename: 'test.pdf'
    })
  });
  console.log(res.status, await res.text());
}
run();
