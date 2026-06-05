const fs = require('fs');

async function sendBackup() {
    const htmlContent = fs.readFileSync('frontend/index.html', 'utf8');
    const tsContent = fs.readFileSync('src/index.ts', 'utf8');
    const chatContent = fs.readFileSync('frontend/chat-widget.js', 'utf8');

    const htmlBase64 = Buffer.from(htmlContent).toString('base64');
    const tsBase64 = Buffer.from(tsContent).toString('base64');
    const chatBase64 = Buffer.from(chatContent).toString('base64');

    const payload = {
        from: "EYE STAFF <onboarding@resend.dev>",
        to: ["ncarrillok@gmail.com"],
        subject: "Backup Completo V2.7.5 - 05/06/2026",
        html: `
            <h2>Resumen del Backup</h2>
            <p>Se ha realizado un backup de la versión <strong>V2.7.5</strong> del sistema EYE STAFF.</p>
            <p><strong>Fecha:</strong> 05/06/2026</p>
            <p><strong>Cambios incluidos:</strong></p>
            <ul>
                <li>Unificación del chat interno y el chat externo.</li>
                <li>Indicador verde intermitente en avatares de usuarios conectados.</li>
                <li>Tooltip flotante (hover/tap) para ver la lista de personal conectado.</li>
                <li>Botones de creación rápida de grupos y colores personalizados en lista.</li>
                <li>Fix crítico de guardado de grupos en Cloudflare D1.</li>
            </ul>
            <ul>
                <li><strong>frontend/index.html</strong> (Dashboard unificado)</li>
                <li><strong>src/index.ts</strong> (Backend Cloudflare Worker)</li>
                <li><strong>frontend/chat-widget.js</strong> (Módulo de Chat)</li>
            </ul>
            <p>Se adjuntan los archivos fuente completos correspondientes a este backup.</p>
        `,
        attachments: [
            {
                filename: "backup_v2.7.5_index.html",
                content: htmlBase64
            },
            {
                filename: "backup_v2.7.5_index.ts.txt",
                content: tsBase64
            },
            {
                filename: "backup_v2.7.5_chat-widget.txt",
                content: chatBase64
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
