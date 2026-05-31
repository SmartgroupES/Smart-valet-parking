async function run() {
    try {
        console.log('1. Attempting login as guest...');
        const loginRes = await fetch('http://localhost:8788/api/staff/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'guest', cedula: 'invitado' })
        });
        
        console.log('Login status:', loginRes.status);
        const loginData = await loginRes.json();
        if (!loginRes.ok) {
            console.error('Login failed:', loginData);
            return;
        }
        
        const token = loginData.token;
        const userId = loginData.id;
        console.log('Token successfully acquired! User ID:', userId);

        console.log('\n2. Fetching chat users...');
        const usersRes = await fetch('http://localhost:8788/api/chat/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log('Users status:', usersRes.status);
        const usersData = await usersRes.json();
        console.log('Users count:', usersData.users ? usersData.users.length : 0);

        console.log('\n3. Fetching chat messages...');
        const msgRes = await fetch(`http://localhost:8788/api/chat/messages?sender_id=${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log('Messages status:', msgRes.status);
        const msgData = await msgRes.json();
        console.log('Messages data:', msgData);
        
    } catch (e) {
        console.error('Error during execution:', e);
    }
}

run();
