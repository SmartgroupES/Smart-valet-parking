require('dotenv').config();
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const fs = require('fs');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.BOT_API_KEY || 'dev-local-api-key';

let sock;
let latestQrDataUrl = null;
let isConnected = false;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // We handle the QR manually
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n--- SCAN THE QR CODE FROM THE WEBPAGE ---');
            qrcodeTerminal.generate(qr, { small: true });
            try {
                latestQrDataUrl = await qrcode.toDataURL(qr);
            } catch (err) {
                console.error("Error generating QR data URL", err);
            }
        }

        if (connection === 'close') {
            isConnected = false;
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            
            if (shouldReconnect) {
                connectToWhatsApp();
            } else {
                console.log('You are logged out. Please delete the auth_info_baileys folder and restart.');
                latestQrDataUrl = null;
            }
        } else if (connection === 'open') {
            isConnected = true;
            latestQrDataUrl = null;
            console.log('✅ WhatsApp Bot is Connected and Ready!');
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Middleware to authenticate requests
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${API_KEY}`) {
        return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
    }
    next();
}

// Keep-Alive Endpoint for Render
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// Serve the QR Code on the root endpoint!
app.get('/', (req, res) => {
    if (isConnected) {
        return res.send('<h1>✅ El Bot de WhatsApp está Conectado y Listo!</h1>');
    }
    
    if (latestQrDataUrl) {
        res.send(`
            <html>
                <body style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background-color:#f0f2f5; font-family:sans-serif;">
                    <h2>Escanea este código QR con WhatsApp</h2>
                    <p>La página se refrescará sola cada 10 segundos.</p>
                    <img src="${latestQrDataUrl}" alt="QR Code" style="width:300px; height:300px; border:10px solid white; border-radius:10px; box-shadow:0px 4px 10px rgba(0,0,0,0.1);" />
                    <script>
                        setTimeout(() => location.reload(), 10000);
                    </script>
                </body>
            </html>
        `);
    } else {
        res.send('<h1>Cargando código QR... refresca en unos segundos.</h1><script>setTimeout(() => location.reload(), 3000);</script>');
    }
});

app.post('/api/send', authMiddleware, async (req, res) => {
    try {
        const { to, message } = req.body;
        
        if (!to || !message) {
            return res.status(400).json({ error: 'Missing "to" or "message" in request body' });
        }

        if (!sock || !sock.user) {
            return res.status(503).json({ error: 'WhatsApp bot is not connected or authenticated yet. Please scan the QR.' });
        }

        let jid = to;
        if (!jid.includes('@')) {
            jid = `${jid}@s.whatsapp.net`;
        }

        console.log(`Sending message to ${jid}...`);
        await sock.sendMessage(jid, { text: message });

        return res.json({ success: true, jid, message: 'Sent successfully' });
    } catch (error) {
        console.error('Failed to send message:', error);
        return res.status(500).json({ error: 'Internal server error while sending message' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 WhatsApp microservice running on port ${PORT}`);
    connectToWhatsApp();
});
