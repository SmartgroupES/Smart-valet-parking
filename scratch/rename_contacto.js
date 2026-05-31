const fs = require('fs');
let html = fs.readFileSync('frontend/index.html', 'utf8');

// 1. Rename in Gestión de Listas (Datos de Evento)
html = html.replace(
    '<label style="font-size:0.7rem; color:var(--muted); font-weight:700;">CONTACTO</label>',
    '<label style="font-size:0.7rem; color:var(--muted); font-weight:700;">NOMBRE DE CLIENTE</label>'
);

// 2. Rename in Nuevo Presupuesto
html = html.replace(
    '<div class="field"><label>CONTACTO</label><input type="text" id="pres-atencion" placeholder="Ej. RAQUEL DAHER"></div>',
    '<div class="field"><label>NOMBRE DE CLIENTE</label><input type="text" id="pres-atencion" placeholder="Ej. RAQUEL DAHER"></div>'
);

// 3. Change mapping in EVENTOS PROGRAMADOS
// The previous mapping had: client: b.empresa || 'N/A',
// We need to change it to: client: (b.form && b.form.atencion) || 'N/A',
html = html.replace(
    "client: b.empresa || 'N/A',",
    "client: (b.form && b.form.atencion) || 'N/A',"
);

// Optional: should we rename "CONTACTO" in the table headers as well?
// The table headers in EVENTOS PROGRAMADOS are: EVENTO, FECHA PROGRAMADA, TIPO DE EVENTO, PERSONAL, CLIENTE, CONTACTO.
// If CLIENTE now holds the person's name, what does the CONTACTO column hold?
// It holds phone numbers. Maybe leave the header as CONTACTO, since it contains the phone number, or change it to TELÉFONO. 
// "el campo cliente en eventos programados debe corresponder a contacto en presupuestos y contacto en gestión de listas"
// It doesn't explicitly say to change the header of the 6th column, just the 5th column's mapping.

fs.writeFileSync('frontend/index.html', html);
console.log("Done");
