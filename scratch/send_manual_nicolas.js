const API_KEY = "re_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF";
const TO = "ncarrillok@gmail.com";

const manualHtml = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Outfit', 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1e293b; background: #f8fafc; margin: 0; padding: 0; }
        .container { max-width: 800px; margin: 40px auto; background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
        .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; padding: 60px 40px; text-align: center; position: relative; }
        .header h1 { margin: 0; font-size: 42px; letter-spacing: -1px; font-weight: 800; }
        .header h1 span { color: #ef4444; }
        .header p { margin-top: 10px; font-size: 18px; opacity: 0.8; font-weight: 400; }
        .badge { display: inline-block; padding: 6px 16px; background: rgba(239, 68, 68, 0.1); color: #ef4444; border-radius: 100px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 20px; }
        
        .content { padding: 40px; }
        .section { margin-bottom: 50px; }
        .section-title { font-size: 24px; font-weight: 800; color: #0f172a; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; }
        .section-title i { color: #ef4444; font-style: normal; }
        
        .module-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 20px; transition: transform 0.2s; }
        .module-card h3 { margin: 0 0 10px 0; font-size: 18px; color: #0f172a; display: flex; align-items: center; gap: 8px; }
        .module-card p { margin: 0; color: #64748b; font-size: 14px; }
        .features-list { list-style: none; padding: 0; margin: 15px 0 0 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .features-list li { font-size: 13px; color: #475569; display: flex; align-items: center; gap: 6px; }
        .features-list li::before { content: '✓'; color: #22c55e; font-weight: bold; }

        .highlight-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 16px; padding: 25px; margin: 30px 0; }
        .highlight-box h4 { margin: 0 0 10px 0; color: #1d4ed8; font-size: 16px; }
        .highlight-box p { margin: 0; font-size: 14px; color: #1e40af; }

        .footer { background: #f1f5f9; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer p { margin: 0; font-size: 12px; color: #94a3b8; font-weight: 600; }
        
        @media (max-width: 600px) {
            .header { padding: 40px 20px; }
            .header h1 { font-size: 32px; }
            .content { padding: 20px; }
            .features-list { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="badge">Manual de Usuario v2.3</div>
            <h1>EYE<span>STAFF</span></h1>
            <p>Ecosistema Integral de Gestión Operativa</p>
        </div>
        
        <div class="content">
            <div class="section">
                <p>Hola <strong>Nicolás</strong>, este documento detalla los módulos y funcionalidades clave del sistema <strong>EYE STAFF</strong> para optimizar la gestión y supervisión del servicio.</p>
            </div>

            <div class="section">
                <div class="section-title"><i>📊</i> 1. MONITOREO Y CONTROL</div>
                <div class="module-card" style="border-left: 4px solid #ef4444;">
                    <h3>Panel de Monitoreo Real</h3>
                    <p>Visualización centralizada de todos los eventos activos en tiempo real.</p>
                    <ul class="features-list">
                        <li>Contador dinámico de entradas/salidas</li>
                        <li>Vehículos actualmente en custodia</li>
                        <li>Filtro por eventos planificados</li>
                        <li>Balance de ocupación por hora</li>
                    </ul>
                </div>
            </div>

            <div class="section">
                <div class="section-title"><i>🚗</i> 2. MÓDULO OPERATIVO (VALET)</div>
                <div class="module-card" style="border-left: 4px solid #f59e0b;">
                    <h3>Gestión de Vehículos</h3>
                    <p>Flujo completo de recepción y entrega con alta seguridad.</p>
                    <ul class="features-list">
                        <li>Registro de placa y daños</li>
                        <li>Fotos de respaldo por vehículo</li>
                        <li>Ticket digital vía WhatsApp/Email</li>
                        <li>Retiro con Clave Dinámica</li>
                    </ul>
                </div>
            </div>

            <div class="section">
                <div class="section-title"><i>👥</i> 3. RECURSOS HUMANOS Y LISTAS</div>
                <div class="module-card" style="border-left: 4px solid #6366f1;">
                    <h3>Control de Personal</h3>
                    <p>Administración de nómina, asistencia y asignación a eventos.</p>
                    <ul class="features-list">
                        <li>Reloj de entrada/salida (Geolocalizado)</li>
                        <li>Asignación masiva a eventos</li>
                        <li>Perfiles con roles RBAC</li>
                        <li>Generación de Carnets QR</li>
                    </ul>
                </div>
            </div>

            <div class="section">
                <div class="section-title"><i>📂</i> 4. ADMINISTRACIÓN Y REPORTES</div>
                <div class="module-card" style="border-left: 4px solid #10b981;">
                    <h3>Data e Inteligencia</h3>
                    <p>Históricos y base de datos para toma de decisiones.</p>
                    <ul class="features-list">
                        <li>Base de datos de Clientes Recurrentes</li>
                        <li>Reportes de Cierre (PDF/Excel)</li>
                        <li>Auditoría de acciones por usuario</li>
                        <li>Gestión de Tarifas y Renta</li>
                    </ul>
                </div>
            </div>

            <div class="highlight-box">
                <h4>🔑 Seguridad Avanzada</h4>
                <p>El sistema incluye restricciones de activación de eventos (3h pre-inicio) y un sistema de auditoría que registra cada movimiento crítico, garantizando la transparencia total del servicio.</p>
            </div>
        </div>

        <div class="footer">
            <p>EYE STAFF 2026 — SMART GROUP OPERATIONS</p>
            <p style="margin-top: 5px; opacity: 0.5;">Este es un documento confidencial para uso interno.</p>
        </div>
    </div>
</body>
</html>
`;

async function sendManual() {
    console.log("Enviando Manual de Usuario a ncarrillok@gmail.com...");
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${API_KEY}`, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
                from: 'EYE STAFF <onboarding@resend.dev>',
                to: [TO],
                subject: '📘 EYE STAFF: Manual de Uso del Ecosistema',
                html: manualHtml
            })
        });
        const data = await res.json();
        console.log("Resultado del envío:", data);
        if (data.id) {
            console.log("MANUAL ENVIADO CORRECTAMENTE.");
        }
    } catch (e) {
        console.error("Error al enviar manual:", e);
    }
}

sendManual();
