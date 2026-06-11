const fs = require('fs');

async function sendBackup() {
    const htmlContent = fs.readFileSync('frontend/index.html', 'utf8');
    const tsContent = fs.readFileSync('src/index.ts', 'utf8');
    const sqlContent = fs.readFileSync('backup_v2.7.10.sql', 'utf8');

    const htmlBase64 = Buffer.from(htmlContent).toString('base64');
    const tsBase64 = Buffer.from(tsContent).toString('base64');
    const sqlBase64 = Buffer.from(sqlContent).toString('base64');

    const payload = {
        from: "EYE STAFF <onboarding@resend.dev>",
        to: ["ncarrillok@gmail.com"],
        subject: "Backup Completo V2.7.10 - 10/06/2026",
        html: `
            <h2>Resumen del Backup</h2>
            <p>Se ha realizado un backup de la versión <strong>V2.7.10</strong> del sistema EYE STAFF.</p>
            <p><strong>Fecha:</strong> 10/06/2026</p>
            <p><strong>Cambios incluidos:</strong></p>
            <ul>
                <li>Ajuste del botón de CHAT a UBICACIÓN con nuevo ícono.</li>
                <li>Actualización del algoritmo de ordenación de personal (Activos > Coche > EYE ID > Nombre alfabético).</li>
                <li>Inactivos ubicados al final de la matriz respetando su propio ordenamiento interno.</li>
                <li>Fix de renderizado de la Ficha de Empleado para priorizar foto actualizada.</li>
            </ul>
            <ul>
                <li><strong>frontend/index.html</strong></li>
                <li><strong>src/index.ts</strong></li>
                <li><strong>backup_v2.7.10.sql</strong> (Base de datos D1 exportada)</li>
            </ul>
            <p>Se adjuntan los archivos fuente completos correspondientes a este backup.</p>
        `,
        attachments: [
            {
                filename: "backup_v2.7.10_index.html",
                content: htmlBase64
            },
            {
                filename: "backup_v2.7.10_index.ts.txt",
                content: tsBase64
            },
            {
                filename: "backup_v2.7.10_valet-db.sql",
                content: sqlBase64
            }
        ]
    };

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer re_GasgFDA6_BoBRxZRw5Ugs9goxzgBbzqTg',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (response.ok) {
        const data = await response.json();
        console.log("Email sent successfully:", data);
    } else {
        const error = await response.text();
        console.error("Failed to send email:", error);
    }
}

sendBackup();
