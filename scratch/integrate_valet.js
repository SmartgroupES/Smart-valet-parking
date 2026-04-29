const fs = require('fs');
const file = '/Users/nelsoncarrillokosak/valet-eye/frontend/index.html';
let content = fs.readFileSync(file, 'utf8');

const saveListaFn = `
    async function saveListaEvento() {
        const name = document.getElementById('lista-nombre').value;
        const type = document.getElementById('lista-tipo').value;
        const date = document.getElementById('lista-fecha').value;
        
        if (!name || !type || !date) {
            return toast('POR FAVOR COMPLETE LOS CAMPOS OBLIGATORIOS (NOMBRE, TIPO, FECHA)', 'error');
        }
        
        showLoading('GUARDANDO EVENTO...');
        
        try {
            if (type === 'Valet Parking') {
                const user = JSON.parse(localStorage.getItem('user') || '{}');
                const supervisor_id = user.id;
                
                const res = await apiFetch('/api/sessions/plan', {
                    method: 'POST',
                    body: JSON.stringify({ 
                        name: name, 
                        type: 'valet', 
                        supervisor_id: supervisor_id,
                        staff_ids: []
                    })
                });
                
                if (res && res.error) throw new Error(res.error);
                
                toast('🚀 EVENTO DE VALET REGISTRADO EN EL MENÚ', 'success');
            } else {
                toast('✅ EVENTO GUARDADO EXITOSAMENTE', 'success');
            }
            
            setTimeout(() => {
                enterModule('listas');
            }, 1500);
            
        } catch (e) {
            toast('❌ ERROR AL GUARDAR: ' + e.message, 'error');
        } finally {
            hideLoading();
        }
    }
`;

// Insert the function before renderListas
content = content.replace('function renderListas(view) {', saveListaFn + '\n    function renderListas(view) {');

// Update button onclick
content = content.replace('onclick="toast(\'Datos guardados exitosamente\', \'success\')"', 'onclick="saveListaEvento()"');

fs.writeFileSync(file, content, 'utf8');
console.log('Integration logic added successfully');
