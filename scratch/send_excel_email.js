const fs = require('fs');
const xlsx = require('xlsx');

const RESEND_API_KEY = "re_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF";

async function main() {
    try {
        console.log("Leyendo base de datos...");
        let rawData = fs.readFileSync('scratch/users.json', 'utf8');
        
        // Sometimes wrangler D1 json output has a top level array with results inside
        let jsonData = JSON.parse(rawData);
        let users = [];
        if (Array.isArray(jsonData) && jsonData[0] && jsonData[0].results) {
            users = jsonData[0].results;
        } else if (jsonData.results) {
            users = jsonData.results;
        } else if (Array.isArray(jsonData)) {
            users = jsonData;
        }

        console.log(`Procesando ${users.length} empleados...`);

        const rows = users.map(u => {
            const name = (u.name || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            
            const isSuperAdmin = name.includes('NELSON CARRILLO') || name.includes('NICOLAS BETANCOURT');
            const isAdmin = u.profile_admin === 'DIRECTOR' || u.profile_admin === 'COORDINADOR';
            const isDirector = u.profile_admin === 'DIRECTOR';
            const isCoordinador = u.profile_admin === 'COORDINADOR';
            
            let vistaApp = "Ver y Operar";
            let vistaAdmin = "No Acceso";
            let vistaAuditoria = "No Acceso";
            let gestionEventos = "No Acceso";
            let gestionEmpleados = "No Acceso";
            let bypassSeguridad = "NO";

            if (isSuperAdmin) {
                vistaAdmin = "Acceso Total";
                vistaAuditoria = "Ver, Modificar y Borrar";
                gestionEventos = "Crear, Editar y Eliminar";
                gestionEmpleados = "Crear, Editar y Eliminar (Roles y Pines)";
                bypassSeguridad = "SÍ";
            } else if (isDirector) {
                vistaAdmin = "Ver y Modificar (Requiere PIN)";
                vistaAuditoria = "Ver";
                gestionEventos = "Crear y Cerrar";
                gestionEmpleados = "Crear y Editar";
            } else if (isCoordinador) {
                vistaAdmin = "Ver (Requiere PIN)";
                gestionEventos = "Crear y Cerrar";
                gestionEmpleados = "Ver Lista y Asistencia";
            } else {
                // Operativos
                if (u.profile_opera === 'VALET') {
                    vistaApp = "Recibir y Entregar Vehículos (No ve finanzas)";
                } else if (u.profile_opera === 'CAJERO') {
                    vistaApp = "Cobrar y Liberar Vehículos";
                } else if (u.profile_opera === 'LOGÍSTICA') {
                    vistaApp = "Movimientos en Patio";
                } else {
                    vistaApp = "Operación Básica";
                }
            }

            return {
                "ID_EYE": u.eye_id || "",
                "NOMBRE": u.name || "",
                "CEDULA": u.cedula || "",
                "TELEFONO": u.phone || "",
                "ESTADO": u.is_active ? "ACTIVO" : "INACTIVO",
                "PERFIL_ADMINISTRATIVO": u.profile_admin || "NO APLICA",
                "PERFIL_OPERATIVO": u.profile_opera || "VALET",
                "PIN_CONFIGURADO": u.pin_hash ? "SÍ" : "NO",
                "VISTA_APP_OPERATIVA": vistaApp,
                "VISTA_ADMIN_PORTAL": vistaAdmin,
                "VISTA_AUDITORIA": vistaAuditoria,
                "GESTION_EVENTOS": gestionEventos,
                "GESTION_EMPLEADOS": gestionEmpleados,
                "BYPASS_SEGURIDAD_PIN": bypassSeguridad,
                "FECHA_CREACION": u.created_at || ""
            };
        });

        // Crear Excel
        console.log("Generando Excel...");
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(rows);
        
        // Auto-size columns slightly
        const wscols = Object.keys(rows[0]).map(() => ({ wch: 20 }));
        ws['!cols'] = wscols;

        xlsx.utils.book_append_sheet(wb, ws, "Perfiles_Permisos");
        const excelBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const base64Excel = excelBuffer.toString('base64');

        // Enviar por Resend
        console.log("Enviando email con archivo adjunto...");
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'EYE STAFF <seguridad@resend.dev>',
                to: ['ncarrillok@gmail.com'],
                subject: '📊 REPORTE MAESTRO: Matriz de Perfiles y Permisos (Excel)',
                html: `
                    <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
                        <h2>Reporte de Perfiles y Permisos de Empleados</h2>
                        <p>Estimado equipo,</p>
                        <p>Adjunto a este correo encontrará el archivo Excel con el detalle de <strong>TODOS</strong> los empleados activos e inactivos de la base de datos de Valet Eye.</p>
                        <p>Se han agregado columnas dinámicas para detallar exactamente qué pantallas y acciones puede realizar cada empleado en función a su perfil de seguridad.</p>
                        <p>Saludos cordiales,<br><strong>EYE STAFF (Antigravity IDE)</strong></p>
                    </div>
                `,
                attachments: [
                    {
                        filename: 'Reporte_Perfiles_Permisos_ValetEye.xlsx',
                        content: base64Excel
                    }
                ]
            })
        });

        const result = await response.json();
        console.log("Resultado Resend:", result);

    } catch (e) {
        console.error("Error general:", e);
    }
}

main();
