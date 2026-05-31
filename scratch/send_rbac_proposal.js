const RESEND_API_KEY = "re_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF";

async function sendEmail() {
    console.log("Enviando propuesta RBAC a Nelson Carrillo...");
    
    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'EYE STAFF <seguridad@resend.dev>',
                to: ['ncarrillok@gmail.com'],
                subject: '🔐 PROPUESTA TÉCNICA: Control de Acceso, Auditoría y Seguridad — Valet Eye',
                html: `
                    <div style="font-family: sans-serif; max-width: 650px; margin: auto; border: 1px solid #eee; border-radius: 20px; overflow: hidden; border-top: 6px solid #6366f1;">
                        <div style="padding: 40px; background: #fafafa;">
                            <h2 style="color: #6366f1; margin: 0; font-size: 24px;">PROPUESTA DE SEGURIDAD Y RBAC</h2>
                            <p style="color: #666; font-size: 14px;">CLIENTE: NELSON CARRILLO / NICOLÁS BETANCOURT</p>
                            
                            <hr style="border: 0; border-top: 1px solid #eee; margin: 25px 0;">
                            
                            <h3 style="color: #333;">1. ACCESO POR PERFILES (LOGIN WALL)</h3>
                            <p style="color: #555;">Se implementará un muro de login obligatorio para todos los usuarios. El sistema identificará a los **Superadministradores** (Nelson y Nicolás) automáticamente por su nombre y cédula.</p>
                            <ul style="color: #555;">
                                <li><b>Nelson Carrillo:</b> Cédula 10334346 (Acceso Total)</li>
                                <li><b>Nicolás Betancourt:</b> Cédula 14519952 (Acceso Total)</li>
                            </ul>

                            <h3 style="color: #333;">2. AUDITORÍA Y TRAZABILIDAD (LOGS)</h3>
                            <p style="color: #555;">Cada clic y cambio realizado será registrado en una base de datos de auditoría, permitiendo saber exactamente quién hizo qué y a qué hora.</p>

                            <h3 style="color: #333;">3. PRESENCIA EN TIEMPO REAL</h3>
                            <p style="color: #555;">En el panel administrativo se podrá ver quién más tiene una sesión abierta en ese momento, facilitando el trabajo colaborativo entre Nelson y Nicolás sin interferencias.</p>

                            <h3 style="color: #333;">4. NORMALIZACIÓN DE NOMBRES</h3>
                            <p style="color: #555;">El sistema será inteligente para reconocer nombres con o sin acentos (ej. NICOLÁS vs NICOLAS), evitando bloqueos por errores tipográficos.</p>

                            <div style="margin-top: 40px; padding: 20px; background: #eef2ff; border-radius: 12px; text-align: center;">
                                <p style="margin: 0; font-weight: bold; color: #6366f1;">ESTA PROPUESTA YA ESTÁ EN EL SCRATCHPAD DE ANTIGRAVITY</p>
                            </div>
                        </div>
                    </div>
                `
            })
        });

        const result = await response.json();
        console.log("Resultado Resend:", result);
    } catch (e) {
        console.error("Error enviando email:", e);
    }
}

sendEmail();
