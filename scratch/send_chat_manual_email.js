const RESEND_API_KEY = "re_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF";

async function sendManualEmail() {
    console.log("Enviando manual de uso de Mensajería Interna...");
    
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: 'EYE STAFF <onboarding@resend.dev>',
            to: ['ncarrillok@gmail.com'],
            subject: '💬 GUÍA COMPLETA: Mensajería Interna y Globo Flotante - v2.4.41',
            html: `
                <div style="font-family: 'Outfit', 'Inter', sans-serif; max-width: 650px; margin: auto; border: 1px solid #1e293b; border-radius: 24px; overflow: hidden; background: #0f172a; color: #f8fafc; border-top: 6px solid #22c55e; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
                    <!-- Header -->
                    <div style="padding: 40px 30px; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); text-align: center; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <span style="font-size: 0.8rem; background: rgba(34, 197, 94, 0.15); color: #22c55e; padding: 4px 12px; border-radius: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Ecosistema Valet Eye</span>
                        <h2 style="color: #ffffff; margin: 15px 0 5px 0; font-size: 28px; font-weight: 900; letter-spacing: 0.5px;">MENSAJERÍA INTERNA REAL-TIME</h2>
                        <p style="color: #94a3b8; font-size: 14px; margin: 0;">Manual Técnico Operativo para Directores y Personal • v2.4.41</p>
                    </div>
                    
                    <!-- Content -->
                    <div style="padding: 35px 30px;">
                        
                        <!-- Globo Flotante -->
                        <div style="background: rgba(34, 197, 94, 0.05); border: 1px solid rgba(34, 197, 94, 0.15); padding: 22px; border-radius: 16px; margin-bottom: 30px;">
                            <h3 style="color: #22c55e; margin: 0 0 10px 0; font-size: 18px; display: flex; align-items: center; gap: 8px;">
                                💬 Globo Flotante (Acceso Express)
                            </h3>
                            <p style="color: #cbd5e1; margin: 0; font-size: 14.5px; line-height: 1.6;">
                                Hemos integrado un <b>globo de chat flotante</b> (estilo chatbot) permanente en la esquina inferior derecha de la pantalla. Este widget permite a cualquier director, coordinador o chofer acceder directamente a sus salas de chat con <b>un solo toque</b> desde cualquier parte del portal.
                            </p>
                        </div>

                        <!-- Estructura del Chat -->
                        <h3 style="color: #ffffff; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px; margin-top: 0; font-size: 18px;">
                            📱 Estructura de Conversaciones (Estilo WhatsApp)
                        </h3>
                        <p style="color: #cbd5e1; font-size: 14.5px; line-height: 1.6;">
                            El panel de mensajería interna ahora funciona de forma idéntica a WhatsApp y está dividido en tres niveles lógicos de comunicación:
                        </p>
                        
                        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                            <tr>
                                <td style="padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: top; width: 40px; font-size: 20px;">🌐</td>
                                <td style="padding: 12px 0 12px 10px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                                    <strong style="color: #22c55e; font-size: 15px;">Chat General (Comunidad)</strong>
                                    <div style="color: #94a3b8; font-size: 13.5px; margin-top: 4px; line-height: 1.5;">
                                        Una sala abierta para toda la organización. Ideal para anuncios globales, alertas generales, avisos de nómina y comunicados oficiales.
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: top; width: 40px; font-size: 20px;">📅</td>
                                <td style="padding: 12px 0 12px 10px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                                    <strong style="color: #6366f1; font-size: 15px;">Chat de Servicio (Eventos Activos)</strong>
                                    <div style="color: #94a3b8; font-size: 13.5px; margin-top: 4px; line-height: 1.5;">
                                        Salas de comunicación exclusiva creadas automáticamente para cada evento activo. Solo los choferes y coordinadores que hayan registrado entrada (clock-in) en ese evento específico pueden ver e interactuar en este chat, asegurando el orden operacional.
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: top; width: 40px; font-size: 20px;">👤</td>
                                <td style="padding: 12px 0 12px 10px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                                    <strong style="color: #f43f5e; font-size: 15px;">Mensajes Directos (1-a-1)</strong>
                                    <div style="color: #94a3b8; font-size: 13.5px; margin-top: 4px; line-height: 1.5;">
                                        Cualquier empleado puede seleccionar a un compañero de la lista del personal en la barra lateral para iniciar un chat privado y encriptado en tiempo real, facilitando la coordinación directa.
                                    </div>
                                </td>
                            </tr>
                        </table>

                        <!-- Seguridad -->
                        <h3 style="color: #ffffff; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px; margin-top: 30px; font-size: 18px;">
                            🔒 Seguridad y Control
                        </h3>
                        <ul style="color: #cbd5e1; font-size: 14px; padding-left: 20px; line-height: 1.7; margin-bottom: 30px;">
                            <li><b>Auditoría Completa:</b> Todas las conversaciones quedan indexadas en el servidor seguro de Cloudflare D1.</li>
                            <li><b>Bypass de Privacidad:</b> Solo los miembros de la conversación activa tienen derecho de lectura y escritura en los endpoints privados.</li>
                            <li><b>Sincronización en Tiempo Real:</b> El chat refresca automáticamente cada 3 segundos en segundo plano sin interrumpir la escritura del usuario.</li>
                        </ul>

                        <!-- Footer -->
                        <div style="margin-top: 40px; padding: 20px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; text-align: center;">
                            <p style="margin: 0; font-size: 14px; font-weight: bold; color: #22c55e; text-transform: uppercase; letter-spacing: 1px;">SISTEMA OPERATIVO Y DESPLEGADO</p>
                            <p style="margin: 5px 0 0 0; font-size: 12px; color: #64748b;">Acceso al portal: https://grupoeyestaff.kosak.es</p>
                        </div>
                    </div>
                </div>
            `
        })
    });

    const result = await response.json();
    console.log("Resultado Resend:", result);
}

sendManualEmail();
