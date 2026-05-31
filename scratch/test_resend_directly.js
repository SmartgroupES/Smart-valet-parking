const resendApiKey = "re_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF";

async function test() {
  const payload = {
    from: 'EYE STAFF <onboarding@resend.dev>',
    to: ['eyestaff.ncarrillo@gmail.com'],
    subject: 'Test Resend Direct',
    html: '<h1>Test from script</h1>'
  };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  console.log('Status:', res.status);
  console.log('Body:', await res.text());
}

test();
