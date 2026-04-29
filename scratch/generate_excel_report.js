
const XLSX = require('xlsx');
const { execSync } = require('child_process');
const fs = require('fs');

async function generateExcel() {
  console.log("Querying database...");
  const query = `
    SELECT 
      s.name as "Nombre Evento",
      s.started_at as "Inicio",
      s.ended_at as "Fin",
      s.status as "Estado",
      u.name as "Personal",
      u.role as "Rol",
      COUNT(e.id) as "Actividad (Eventos)"
    FROM sessions s
    JOIN vehicles v ON v.session_id = s.id
    JOIN events e ON e.vehicle_id = v.id
    JOIN users u ON u.id = e.user_id
    GROUP BY s.id, u.id
    ORDER BY s.started_at DESC
  `;

  try {
    const output = execSync(`npx wrangler d1 execute valet-db --remote --command='${query}' --json`, { encoding: 'utf8' });
    const data = JSON.parse(output)[0].results;

    if (!data || data.length === 0) {
      console.log("No data found.");
      return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);

    // Ajustar anchos de columna básicos
    const wscols = [
      {wch: 30}, // Nombre Evento
      {wch: 20}, // Inicio
      {wch: 20}, // Fin
      {wch: 10}, // Estado
      {wch: 25}, // Personal
      {wch: 15}, // Rol
      {wch: 15}  // Actividad
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, "Reporte de Eventos");

    const filePath = 'scratch/reporte_eventos_staff_2026.xlsx';
    XLSX.writeFile(wb, filePath);
    console.log(`Excel generated: ${filePath}`);
  } catch (err) {
    console.error("Error generating Excel:", err);
  }
}

generateExcel();
