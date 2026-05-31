
const RESEND_API_KEY = 're_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF';
const TO_EMAIL = 'ncarrillok@gmail.com';

const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
        <h2 style="color: #2563eb; text-align: center;">Listado de Accesos - EYE STAFF</h2>
        <p>Hola Nelson, aquí tienes el listado actualizado de perfiles y credenciales de acceso al portal:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <thead>
                <tr style="background-color: #f8fafc;">
                    <th style="border: 1px solid #e2e8f0; padding: 12px; text-align: left;">Nombre</th>
                    <th style="border: 1px solid #e2e8f0; padding: 12px; text-align: left;">Rol</th>
                    <th style="border: 1px solid #e2e8f0; padding: 12px; text-align: left;">Clave / PIN</th>
                </tr>
            </thead>
            <tbody>
                <tr><td style="border: 1px solid #e2e8f0; padding: 12px;"><b>NELSON CARRILLO</b></td><td style="border: 1px solid #e2e8f0; padding: 12px;">Director</td><td style="border: 1px solid #e2e8f0; padding: 12px;"><code>10334346</code></td></tr>
                <tr><td style="border: 1px solid #e2e8f0; padding: 12px;"><b>NICOLAS BETANCOURT</b></td><td style="border: 1px solid #e2e8f0; padding: 12px;">Director</td><td style="border: 1px solid #e2e8f0; padding: 12px;"><code>14519952</code></td></tr>
                <tr><td style="border: 1px solid #e2e8f0; padding: 12px;">JOSÉ GREGORIO RAMOS</td><td style="border: 1px solid #e2e8f0; padding: 12px;">Director</td><td style="border: 1px solid #e2e8f0; padding: 12px;">EyeStaff.2026*</td></tr>
                <tr><td style="border: 1px solid #e2e8f0; padding: 12px;">BILLY GONZÁLEZ</td><td style="border: 1px solid #e2e8f0; padding: 12px;">Director</td><td style="border: 1px solid #e2e8f0; padding: 12px;">EyeStaff.2026*</td></tr>
                <tr><td style="border: 1px solid #e2e8f0; padding: 12px;">LUIS QUERALES</td><td style="border: 1px solid #e2e8f0; padding: 12px;">Supervisor</td><td style="border: 1px solid #e2e8f0; padding: 12px;">EyeStaff.2026*</td></tr>
                <tr><td style="border: 1px solid #e2e8f0; padding: 12px;">DANIELA SESCÚN</td><td style="border: 1px solid #e2e8f0; padding: 12px;">Supervisor</td><td style="border: 1px solid #e2e8f0; padding: 12px;">EyeStaff.2026*</td></tr>
                <tr><td style="border: 1px solid #e2e8f0; padding: 12px;">DERH DÍAZ</td><td style="border: 1px solid #e2e8f0; padding: 12px;">Supervisor</td><td style="border: 1px solid #e2e8f0; padding: 12px;">EyeStaff.2026*</td></tr>
                <tr><td style="border: 1px solid #e2e8f0; padding: 12px;">JOSÉ PIMENTEL</td><td style="border: 1px solid #e2e8f0; padding: 12px;">Supervisor</td><td style="border: 1px solid #e2e8f0; padding: 12px;">EyeStaff.2026*</td></tr>
                <tr><td style="border: 1px solid #e2e8f0; padding: 12px;">RICARDO RODRÍGUEZ</td><td style="border: 1px solid #e2e8f0; padding: 12px;">Supervisor</td><td style="border: 1px solid #e2e8f0; padding: 12px;">EyeStaff.2026*</td></tr>
                <tr><td style="border: 1px solid #e2e8f0; padding: 12px;">MAIFER BARRUETA</td><td style="border: 1px solid #e2e8f0; padding: 12px;">Supervisor</td><td style="border: 1px solid #e2e8f0; padding: 12px;">EyeStaff.2026*</td></tr>
                <tr><td style="border: 1px solid #e2e8f0; padding: 12px;">STEVEN CONTRERAS</td><td style="border: 1px solid #e2e8f0; padding: 12px;">Valet</td><td style="border: 1px solid #e2e8f0; padding: 12px;">EyeStaff.2026*</td></tr>
                <tr><td style="border: 1px solid #e2e8f0; padding: 12px;">MIGUEL ORTEGA</td><td style="border: 1px solid #e2e8f0; padding: 12px;">Valet</td><td style="border: 1px solid #e2e8f0; padding: 12px;">EyeStaff.2026*</td></tr>
                <tr><td style="border: 1px solid #e2e8f0; padding: 12px;">MOISÉS MENDOZA</td><td style="border: 1px solid #e2e8f0; padding: 12px;">Valet</td><td style="border: 1px solid #e2e8f0; padding: 12px;">EyeStaff.2026*</td></tr>
                <tr><td style="border: 1px solid #e2e8f0; padding: 12px;">JOSÉ ATELLA</td><td style="border: 1px solid #e2e8f0; padding: 12px;">Valet</td><td style="border: 1px solid #e2e8f0; padding: 12px;">EyeStaff.2026*</td></tr>
                <tr><td style="border: 1px solid #e2e8f0; padding: 12px;">WILMER BURGOS</td><td style="border: 1px solid #e2e8f0; padding: 12px;">Valet</td><td style="border: 1px solid #e2e8f0; padding: 12px;">EyeStaff.2026*</td></tr>
                <tr><td style="border: 1px solid #e2e8f0; padding: 12px;">DELVIN SUÁREZ</td><td style="border: 1px solid #e2e8f0; padding: 12px;">Valet</td><td style="border: 1px solid #e2e8f0; padding: 12px;">EyeStaff.2026*</td></tr>
                <tr><td style="border: 1px solid #e2e8f0; padding: 12px;">ELVIS PRESLEY</td><td style="border: 1px solid #e2e8f0; padding: 12px;">Valet</td><td style="border: 1px solid #e2e8f0; padding: 12px;">EyeStaff.2026*</td></tr>
            </tbody>
        </table>
        
        <p style="margin-top: 30px; font-size: 0.9em; color: #64748b;">Este es un mensaje automático del sistema de seguridad de EYE STAFF.</p>
    </div>
`;

async function send() {
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: 'EYE STAFF <onboarding@resend.dev>',
            to: [TO_EMAIL],
            subject: 'Listado de Credenciales - EYE STAFF',
            html: html
        })
    });
    const data = await res.json();
    console.log(data);
}

send();
