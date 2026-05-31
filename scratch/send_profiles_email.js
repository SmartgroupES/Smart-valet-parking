

const RESEND_API_KEY = "re_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF";

async function sendEmail() {
    console.log("Enviando detalle de perfiles y permisos a ncarrillok@gmail.com...");
    
    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'Valet Eye Security <seguridad@resend.dev>',
                to: ['ncarrillok@gmail.com'],
                subject: '🔐 MATRIZ DE SEGURIDAD: Perfiles y Permisos (Valet Eye)',
                html: `
                    <div style="font-family: sans-serif; max-width: 650px; margin: auto; border: 1px solid #eee; border-radius: 20px; overflow: hidden; border-top: 6px solid #10b981;">
                        <div style="padding: 40px; background: #fafafa;">
                            <h2 style="color: #10b981; margin: 0; font-size: 24px;">MATRIZ DE PERFILES Y PERMISOS</h2>
                            <p style="color: #666; font-size: 14px;">Plataforma: VALET EYE | Sistema de Control de Acceso (RBAC)</p>
                            
                            <hr style="border: 0; border-top: 1px solid #eee; margin: 25px 0;">
                            
                            <h3 style="color: #333; font-size: 18px; margin-bottom: 5px;">👑 1. SUPER ADMINISTRADORES (Fundadores)</h3>
                            <p style="color: #059669; font-size: 12px; margin-top: 0; font-weight: bold;">[Nelson Carrillo / Nicolás Betancourt]</p>
                            <ul style="color: #555; font-size: 14px; line-height: 1.6;">
                                <li><b>Control Total:</b> Acceso ilimitado a absolutamente todas las funciones del sistema.</li>
                                <li><b>Bypass de Seguridad:</b> Pueden entrar a la Consola de Auditoría Restringida sin necesidad de PIN numérico.</li>
                                <li><b>Gestión de Usuarios:</b> Pueden crear, editar y eliminar cualquier registro de personal, así como cambiar perfiles y generar nuevos PINs.</li>
                                <li><b>Gestión de Operaciones:</b> Pueden alterar estados de pagos, forzar finalización de turnos, eliminar vehículos del sistema y gestionar la base de datos maestra en la nube.</li>
                                <li><b>Data y Exportación:</b> Acceso a descargar todos los reportes, estadísticas y bases de datos completas en Excel y JSON.</li>
                            </ul>

                            <h3 style="color: #333; font-size: 18px; margin-bottom: 5px; margin-top: 35px;">👔 2. PERFIL ADMINISTRATIVO: DIRECTOR</h3>
                            <p style="color: #059669; font-size: 12px; margin-top: 0; font-weight: bold;">[Requiere PIN 2FA para el Panel Admin]</p>
                            <ul style="color: #555; font-size: 14px; line-height: 1.6;">
                                <li><b>Consola Administrativa:</b> Tienen acceso al módulo de administración y configuración global.</li>
                                <li><b>Gestión Operativa:</b> Tienen el poder de crear "Nuevos Eventos / Sesiones", cerrarlos y gestionarlos.</li>
                                <li><b>Gestión de Personal:</b> Pueden registrar a nuevos empleados y asignarles PIN temporal, pero no pueden revocar accesos de Super Administradores.</li>
                                <li><b>Rastreo Avanzado:</b> Pueden usar el módulo de rastreo para ubicar qué valet movió cada vehículo y la línea de tiempo completa.</li>
                                <li><b>Dashboard:</b> Acceso a gráficas estadísticas e ingresos financieros del turno.</li>
                            </ul>

                            <h3 style="color: #333; font-size: 18px; margin-bottom: 5px; margin-top: 35px;">📋 3. PERFIL ADMINISTRATIVO: COORDINADOR</h3>
                            <p style="color: #059669; font-size: 12px; margin-top: 0; font-weight: bold;">[Requiere PIN 2FA para el Panel Admin]</p>
                            <ul style="color: #555; font-size: 14px; line-height: 1.6;">
                                <li><b>Funciones similares al Director, con restricciones clave.</b></li>
                                <li><b>Operación de Pista:</b> Puede abrir y cerrar Eventos y supervisar en tiempo real los vehículos activos en patio.</li>
                                <li><b>Supervisión de Personal:</b> Puede ver la lista de personal activo y pasar asistencia.</li>
                                <li><b>Restricciones:</b> NO tiene permisos para modificar datos destructivos (eliminar empleados, borrar vehículos permanentemente) ni descargar el backup maestro del sistema.</li>
                            </ul>

                            <h3 style="color: #333; font-size: 18px; margin-bottom: 5px; margin-top: 35px;">🚗 4. PERFILES OPERATIVOS (Sin acceso Admin)</h3>
                            <p style="color: #ef4444; font-size: 12px; margin-top: 0; font-weight: bold;">[Acceso estrictamente limitado al Portal Operativo (App)]</p>
                            
                            <p style="color: #555; font-size: 14px; margin-bottom: 5px;"><b>4.1. ROL VALET:</b></p>
                            <ul style="color: #555; font-size: 14px; line-height: 1.6; margin-top: 0;">
                                <li>Sólo puede: "Recibir Vehículo", tomar fotos, registrar averías/daños, y marcar vehículos como "Estacionado" o "Entregado".</li>
                                <li>No ve dinero, no ve estadísticas, no ve configuraciones.</li>
                            </ul>

                            <p style="color: #555; font-size: 14px; margin-bottom: 5px;"><b>4.2. ROL CAJERO:</b></p>
                            <ul style="color: #555; font-size: 14px; line-height: 1.6; margin-top: 0;">
                                <li>Especializado en cobro. Puede cambiar el estado de pago de un ticket de "Pendiente" a "Pagado" y aplicar descuentos autorizados.</li>
                                <li>Marca el vehículo como "Aprobado para Entrega" para que el Valet proceda a buscarlo en el patio.</li>
                            </ul>

                            <p style="color: #555; font-size: 14px; margin-bottom: 5px;"><b>4.3. ROL LOGÍSTICA:</b></p>
                            <ul style="color: #555; font-size: 14px; line-height: 1.6; margin-top: 0;">
                                <li>Personal de apoyo interno en el patio que acomoda y reorganiza vehículos sin interacción con clientes o cobros. Pueden actualizar el sector de estacionamiento de un vehículo.</li>
                            </ul>
                            
                            <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
                            <p style="color: #999; font-size: 11px; text-align: center;">Reporte automático generado por Antigravity IDE - Valet Eye Security Module</p>
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
