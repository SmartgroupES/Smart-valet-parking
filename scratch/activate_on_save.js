const fs = require('fs');
const file = '/Users/nelsoncarrillokosak/valet-eye/frontend/index.html';
let content = fs.readFileSync(file, 'utf8');

// Update saveListaEvento to also activate the session if it's Valet Parking
const oldSaveLogic = `                if (res && res.error) throw new Error(res.error);
                
                toast('🚀 EVENTO DE VALET REGISTRADO EN EL MENÚ', 'success');`;

const newSaveLogic = `                if (res && res.error) throw new Error(res.error);

                // Activar inmediatamente para que aparezca en el menú
                if (res.id) {
                    await apiFetch('/api/sessions/activate', {
                        method: 'POST',
                        body: JSON.stringify({ 
                            id: res.id, 
                            supervisor_id: supervisor_id, 
                            staff_ids: [] 
                        })
                    });
                }
                
                toast('🚀 EVENTO DE VALET ACTIVADO EN EL MENÚ', 'success');`;

content = content.replace(oldSaveLogic, newSaveLogic);

fs.writeFileSync(file, content, 'utf8');
console.log('Valet session now activates immediately upon creation from Listas');
