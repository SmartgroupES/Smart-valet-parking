const fs = require('fs');

async function sendBackup() {
    const htmlContent = fs.readFileSync('frontend/index.html', 'utf8');
    const tsContent = fs.readFileSync('src/index.ts', 'utf8');

    const htmlBase64 = Buffer.from(htmlContent).toString('base64');
    const tsBase64 = Buffer.from(tsContent).toString('base64');

    const payload = {
        from: "EYE STAFF <onboarding@resend.dev>",
        to: ["ncarrillok@gmail.com"],
        subject: "Backup Completo V2.5.55",
        html: `
            <h2>Resumen del Backup</h2>
            <p>Se ha realizado un backup de la versión V2.5.55 del sistema EYE STAFF.</p>
            <ul>
                <li><strong>frontend/index.html</strong> (Dashboard unificado)</li>
                <li><strong>src/index.ts</strong> (Backend Cloudflare Worker)</li>
            </ul>
            <p>Se adjuntan los archivos fuente completos correspondientes a este backup.</p>
        `,
        attachments: [
            {
                filename: "backup_v2.5.55_index.html",
                content: htmlBase64
            },
            {
                filename: "backup_v2.5.55_index.ts",
                content: tsBase64
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
