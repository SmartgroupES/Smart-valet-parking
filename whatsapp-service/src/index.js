require('dotenv').config();
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const fs = require('fs');
const AdmZip = require('adm-zip');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.BOT_API_KEY || 'dev-local-api-key';

let sock;
let latestQrDataUrl = null;
let isConnected = false;
let backupTimeout = null;

async function uploadBackup() {
    try {
        if (!fs.existsSync('auth_info_baileys')) return;
        const zip = new AdmZip();
        zip.addLocalFolder('auth_info_baileys');
        const buffer = zip.toBuffer();
        
        const backendUrl = process.env.BACKEND_URL || 'https://eye-staff.app';
        const apiKey = process.env.BOT_API_KEY || 'dev-local-api-key';
        
        await fetch(`${backendUrl}/api/whatsapp/backup`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/zip'
            },
            body: buffer
        });
        console.log('☁️ Backup de sesión subido a R2 exitosamente.');
    } catch(e) {
        console.error('Error subiendo backup:', e);
    }
}

function scheduleBackup() {
    if (backupTimeout) clearTimeout(backupTimeout);
    backupTimeout = setTimeout(() => {
        uploadBackup();
    }, 10000); // 10 seconds debounce
}

async function downloadBackup() {
    try {
        const backendUrl = process.env.BACKEND_URL || 'https://eye-staff.app';
        const apiKey = process.env.BOT_API_KEY || 'dev-local-api-key';
        const res = await fetch(`${backendUrl}/api/whatsapp/backup`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (res.ok) {
            const buffer = await res.arrayBuffer();
            const zip = new AdmZip(Buffer.from(buffer));
            zip.extractAllTo('auth_info_baileys', true);
            console.log('☁️ Backup descargado y extraído correctamente.');
        } else {
            console.log('No se encontró backup en la nube (o error al descargar).');
        }
    } catch(e) {
        console.error('Error descargando backup:', e);
    }
}

async function connectToWhatsApp() {
    if (!fs.existsSync('auth_info_baileys')) {
        console.log('Buscando backup en la nube...');
        await downloadBackup();
    }
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
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            
            // Si es 401 (Logged Out), 403 (Forbidden/Corrupt) o 500 (Bad Session), limpiar sesión
            const isCorruptedOrLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403 || statusCode === 500;
            const shouldReconnect = !isCorruptedOrLoggedOut;
            
            console.log('Connection closed due to ', lastDisconnect?.error, ' (Code: ', statusCode, '), reconnecting: ', shouldReconnect);
            
            if (shouldReconnect) {
                // Pequeño delay antes de reconectar para evitar saturación de CPU en bucles de caída
                setTimeout(connectToWhatsApp, 3000);
            } else {
                console.log('Sesión inválida, cerrada o corrupta. Eliminando auth_info_baileys y solicitando nuevo QR...');
                try {
                    fs.rmSync('auth_info_baileys', { recursive: true, force: true });
                } catch (e) {
                    console.error('Failed to delete auth_info_baileys:', e);
                }
                latestQrDataUrl = null;
                setTimeout(connectToWhatsApp, 2000);
            }
        } else if (connection === 'open') {
            isConnected = true;
            latestQrDataUrl = null;
            console.log('✅ WhatsApp Bot is Connected and Ready!');
        }
    });

    sock.ev.on('creds.update', async () => {
        await saveCreds();
        scheduleBackup();
    });

    // Escuchar mensajes entrantes para capturar ubicaciones compartidas
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (msg.key.fromMe) continue; // Ignorar mensajes propios

            const from = msg.key.remoteJid;
            if (!from) continue;

            // Extraer número de teléfono limpio (sin @s.whatsapp.net)
            const phone = from.replace('@s.whatsapp.net', '').replace('@g.us', '');

            // --- Captura de UBICACIÓN en tiempo real ---
            const locMsg = msg.message?.locationMessage || msg.message?.liveLocationMessage;
            if (locMsg) {
                const lat = locMsg.degreesLatitude;
                const lon = locMsg.degreesLongitude;
                const accuracy = locMsg.accuracyInMeters || null;

                if (lat !== undefined && lon !== undefined) {
                    console.log(`📍 Ubicación recibida de ${phone}: lat=${lat}, lon=${lon}`);
                    try {
                        const backendUrl = process.env.BACKEND_URL || 'https://eye-staff.app';
                        const apiKey = process.env.BACKEND_API_KEY || 'dev-local-api-key';
                        const res = await fetch(`${backendUrl}/api/staff/location`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${apiKey}`
                            },
                            body: JSON.stringify({ phone, lat, lon, accuracy })
                        });
                        const data = await res.json();
                        console.log(`✅ Ubicación guardada para ${data.name || phone}`);

                        // Confirmar recepción al empleado
                        await sock.sendMessage(from, {
                            text: `📍 *Ubicación recibida*\nTu posición ha sido registrada en el sistema Eye Staff.\n_Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}_`
                        });
                    } catch (err) {
                        console.error('Error enviando ubicación al backend:', err);
                    }
                }
                continue;
            }

            // --- Comando de texto: !ubicacion ---
            const textBody = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
            if (textBody.toLowerCase().trim() === '!ubicacion' || textBody.toLowerCase().trim() === '!mi ubicacion') {
                await sock.sendMessage(from, {
                    text: `📍 *Compartir ubicación*\nPulsa el clip 📎 → Ubicación → "Compartir ubicación en tiempo real"\nTu posición aparecerá en el mapa del sistema Eye Staff.`
                });
            }
        }
    });
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

// Force reset endpoint to fix stuck QR
app.get('/reset', (req, res) => {
    console.log('Manual reset requested via /reset endpoint');
    try {
        fs.rmSync('auth_info_baileys', { recursive: true, force: true });
    } catch (e) {
        console.error('Failed to delete auth_info_baileys:', e);
    }
    latestQrDataUrl = null;
    isConnected = false;
    if (sock) {
        try { sock.logout(); } catch(e) {}
    }
    
    // Instead of calling connectToWhatsApp which clashes with the 'close' event,
    // we simply exit the process. Render will automatically restart the service
    // with a fresh environment, effectively clearing the hung connection cleanly.
    res.send('<h1>Reiniciando servicio por completo. El QR cargará en 15 segundos.</h1><script>setTimeout(() => location.href="/", 15000);</script>');
    
    setTimeout(() => {
        process.exit(1);
    }, 1000);
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
