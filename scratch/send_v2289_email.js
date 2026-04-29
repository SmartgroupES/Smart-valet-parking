const RESEND_API_KEY = "re_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF";

async function sendEmail() {
    console.log("Enviando notificación de actualización v2.2.89...");
    
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: 'EYE STAFF <onboarding@resend.dev>',
            to: ['ncarrillok@gmail.com'],
            subject: '🚀 ACTUALIZACIÓN SISTEMA: Geolocalización & Optimizaciones v2.2.89',
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 20px; overflow: hidden; border-top: 6px solid #a855f7;">
                    <div style="padding: 40px; background: #fafafa;">
                        <h2 style="color: #a855f7; margin: 0; font-size: 24px;">ACTUALIZACIÓN COMPLETADA</h2>
                        <p style="color: #666; font-size: 14px;">VERSIÓN v2.2.89 • 28 DE ABRIL 2026</p>
                        
                        <hr style="border: 0; border-top: 1px solid #eee; margin: 25px 0;">
                        
                        <h3 style="color: #333;">📍 LANZAMIENTO: MÓDULO DE GEOLOCALIZACIÓN</h3>
                        <p style="color: #555;">Se ha activado el monitoreo en tiempo real de personal y equipos.</p>
                        <ul style="color: #555;">
                            <li><b>Mapa Satelital:</b> Visualización premium con Leaflet.js.</li>
                            <li><b>Seguimiento Staff:</b> Rastreo GPS de personal con entrada activa.</li>
                            <li><b>Control de Activos:</b> Registro y localización de equipos técnicos.</li>
                        </ul>

                        <h3 style="color: #333;">🛠️ OPTIMIZACIONES DE EXPERIENCIA</h3>
                        <ul style="color: #555;">
                            <li><b>Búsqueda de Personal:</b> Corregido el anclaje de resultados (ahora aparecen justo bajo el buscador).</li>
                            <li><b>Reset de Formulario:</b> El panel de eventos se limpia automáticamente tras guardar.</li>
                            <li><b>Corrección Calendario:</b> Reparado el error de zona horaria (Eventos planificados ya aparecen en el día correcto).</li>
                        </ul>

                        <h3 style="color: #333;">💾 SEGURIDAD</h3>
                        <p style="color: #555;">Se ha realizado un <b>BACKUP TOTAL (v2.2.89)</b> de código y base de datos.</p>
                        
                        <div style="margin-top: 40px; padding: 20px; background: #f0f0f0; border-radius: 12px; text-align: center;">
                            <p style="margin: 0; font-weight: bold; color: #a855f7;">SISTEMA OPERATIVO Y ACTUALIZADO</p>
                        </div>
                    </div>
                </div>
            `
        })
    });

    const result = await response.json();
    console.log("Resultado Resend:", result);
}

sendEmail();
