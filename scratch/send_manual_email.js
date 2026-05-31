const fs = require('fs');

async function sendEmail() {
  try {
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #0088cc;">Manual de Uso: Integración Telegram Bot de EYE STAFF</h2>
        <p>Este manual detalla cómo utilizar la nueva integración bidireccional entre la plataforma web de EYE STAFF y el Bot oficial de Telegram.</p>
        
        <h3 style="color: #1e293b; border-bottom: 2px solid #0088cc; padding-bottom: 5px;">1. Para el Personal Operativo (Empleados)</h3>
        
        <h4>A. Vincular la cuenta</h4>
        <ol>
          <li><strong>Abre Telegram</strong> y busca el Bot oficial de la empresa.</li>
          <li>Toca el botón <strong>Iniciar</strong> o escribe <code>/start</code>.</li>
          <li>Envía el comando de vinculación junto a tu ID interno de empleado: <code>/start link_&lt;TU_ID&gt;</code> (Ej: <code>/start link_15</code>).</li>
          <li>Si el código es correcto, el Bot te responderá: <em>"✅ Cuenta vinculada exitosamente con EYE STAFF"</em>.</li>
        </ol>

        <h4>B. Compartir Ubicación en Tiempo Real</h4>
        <ol>
          <li>Abre el chat con el Bot de Telegram.</li>
          <li>Toca el icono de <strong>clip 📎</strong> (adjuntar).</li>
          <li>Selecciona <strong>Ubicación</strong> y luego elige <strong>Compartir mi ubicación en tiempo real</strong>.</li>
          <li>Selecciona el tiempo de tu jornada. La central visualizará tu movimiento automáticamente.</li>
        </ol>

        <h4>C. Enviar Mensajes y Reportes</h4>
        <p>Cualquier mensaje de texto que escribas en el chat será recibido de forma instantánea por los administradores en el panel web. Úsalo para reportar llegadas, pedir relevos, etc.</p>

        <h3 style="color: #1e293b; border-bottom: 2px solid #0088cc; padding-bottom: 5px;">2. Para Supervisores y Administradores (Panel Web)</h3>
        
        <h4>A. Abrir el Chat</h4>
        <p>En la esquina inferior derecha de tu pantalla verás un botón circular azul con un globo de diálogo (💬). Haz clic sobre él para abrir el panel de comunicaciones.</p>

        <h4>B. Interpretación Visual</h4>
        <ul>
          <li><strong>Estilo Telegram:</strong> Burbujas verdes y blancas.</li>
          <li><strong>Estilo EYESTAFF (Recomendado):</strong> Códigos de colores inteligentes:
            <ul>
              <li>🔵 <strong>Línea Azul:</strong> Valet Parking.</li>
              <li>🟢 <strong>Línea Verde:</strong> Logística / Renta de equipos.</li>
              <li>🟠 <strong>Línea Naranja:</strong> Xpress / Otros.</li>
            </ul>
          </li>
        </ul>

        <h4>C. Visualización de Ubicaciones</h4>
        <p>Si un empleado comparte su ubicación, el sistema dibujará un mapa interactivo de Google Maps directamente dentro del mensaje del chat.</p>

        <p><br><strong>Grupo Eye Staff</strong><br>Sistema de Gestión Automatizado</p>
      </div>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer re_GasgFDA6_BoBRxZRw5Ugs9goxzgBbzqTg',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'EYE STAFF <onboarding@resend.dev>',
        to: ['ncarrillok@gmail.com'],
        subject: 'Manual de Uso: Bot de Telegram - EYE STAFF',
        html: htmlContent
      })
    });

    const data = await res.json();
    if (res.ok) {
      console.log('Email sent successfully!', data);
    } else {
      console.error('Failed to send email:', data);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

sendEmail();
