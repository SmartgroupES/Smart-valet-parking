const fs = require('fs');
let content = fs.readFileSync('frontend/index.html', 'utf8');

// 1. Equipos
const targetEquipos = `                        <!-- SECCIÓN EQUIPOS / ACTIVOS -->
                        <div class="vehicle-card" style="padding:20px; border-radius:20px; background:rgba(168, 85, 247, 0.05); border:1px solid rgba(168, 85, 247, 0.2);">
                            <h3 style="font-size:0.8rem; color:#a855f7; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
                                📻 EQUIPOS Y ACTIVOS
                                <span style="font-size:0.6rem; background:#a855f7; color:white; padding:2px 8px; border-radius:10px;">${locations.assets.length}</span>
                            </h3>
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                ${locations.assets.map(a => \`
                                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:10px; border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
                                        <div>
                                            <div style="font-size:0.75rem; font-weight:900; color:#fff;">\${a.name.toUpperCase()}</div>
                                            <div style="font-size:0.55rem; color:var(--muted); font-weight:700;">\${a.type} • BATERÍA: <span style="color:var(--success)">85%</span></div>
                                        </div>
                                        <button class="btn btn-sm" style="padding:4px 8px; font-size:0.6rem; border-radius:6px; background:#a855f7;" onclick="centerMapOn(\${a.latitude}, \${a.longitude})">VER</button>
                                    </div>
                                \`).join('') || '<div style="font-size:0.6rem; color:var(--muted); text-align:center;">SIN EQUIPOS REGISTRADOS</div>'}
                            </div>
                            <button class="btn" style="width:100%; margin-top:15px; font-size:0.65rem; padding:10px; border-radius:10px; background:rgba(168, 85, 247, 0.2); border:1px solid #a855f7; color:#fff;" onclick="showAddAssetForm()">+ REGISTRAR EQUIPO</button>
                        </div>`;

const replaceEquipos = `                        <!-- SECCIÓN EQUIPOS / ACTIVOS -->
                        <div class="vehicle-card" id="equipos-activos-card" style="padding:20px; border-radius:20px; background:rgba(168, 85, 247, 0.05); border:1px solid rgba(168, 85, 247, 0.2);">
                            <h3 style="font-size:0.8rem; color:#a855f7; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="const content = document.getElementById('equipos-content'); const icon = document.getElementById('equipos-icon'); if(content.style.display==='none'){content.style.display='flex'; icon.textContent='▲';}else{content.style.display='none'; icon.textContent='▼';}">
                                <span>📻 EQUIPOS Y ACTIVOS</span>
                                <div>
                                    <span style="font-size:0.6rem; background:#a855f7; color:white; padding:2px 8px; border-radius:10px; margin-right:5px;">\${locations.assets.length}</span>
                                    <span id="equipos-icon">▼</span>
                                </div>
                            </h3>
                            <div id="equipos-content" style="display:none; flex-direction:column; gap:8px;">
                                <div style="display:flex; flex-direction:column; gap:8px;">
                                    \${locations.assets.map(a => \`
                                        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:10px; border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
                                            <div>
                                                <div style="font-size:0.75rem; font-weight:900; color:#fff;">\${a.name.toUpperCase()}</div>
                                                <div style="font-size:0.55rem; color:var(--muted); font-weight:700;">\${a.type} • BATERÍA: <span style="color:var(--success)">85%</span></div>
                                            </div>
                                            <button class="btn btn-sm" style="padding:4px 8px; font-size:0.6rem; border-radius:6px; background:#a855f7;" onclick="centerMapOn(\${a.latitude}, \${a.longitude})">VER</button>
                                        </div>
                                    \`).join('') || '<div style="font-size:0.6rem; color:var(--muted); text-align:center;">SIN EQUIPOS REGISTRADOS</div>'}
                                </div>
                                <button class="btn" style="width:100%; margin-top:15px; font-size:0.65rem; padding:10px; border-radius:10px; background:rgba(168, 85, 247, 0.2); border:1px solid #a855f7; color:#fff;" onclick="showAddAssetForm()">+ REGISTRAR EQUIPO</button>
                            </div>
                        </div>`;

// 2. Domicilios
const targetDomicilios = `                        domDiv.innerHTML = \`
                            <h3 style="font-size:0.8rem; color:#22c55e; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                                🏠 DOMICILIOS DEL PERSONAL
                                <span style="font-size:0.6rem; background:#22c55e; color:white; padding:2px 8px; border-radius:10px;">\${allStaff.length}</span>
                            </h3>
                            <div style="position:relative; margin-bottom:12px;">
                                <input type="text" id="staff-home-search" placeholder="Buscar empleado o sector..." 
                                    style="width:100%; padding:8px 12px 8px 30px; font-size:0.65rem; color:#fff; background:rgba(255,255,255,0.03); border:1px solid rgba(34,197,94,0.15); border-radius:10px; outline:none; transition:all 0.3s ease; box-sizing:border-box;"
                                    onfocus="this.style.border='1px solid #22c55e'; this.style.background='rgba(255,255,255,0.06)'; this.style.boxShadow='0 0 8px rgba(34,197,94,0.2)';"
                                    onblur="this.style.border='1px solid rgba(34,197,94,0.15)'; this.style.background='rgba(255,255,255,0.03)'; this.style.boxShadow='none';" />
                                <span style="position:absolute; left:10px; top:50%; transform:translateY(-50%); font-size:0.65rem; color:rgba(34,197,94,0.6); pointer-events:none;">🔍</span>
                            </div>
                            <div id="staff-home-list" style="display:flex; flex-direction:column; gap:6px; max-height:220px; overflow-y:auto;">
                                \${allStaff.length === 0 ? '<div style="font-size:0.6rem;color:var(--muted);text-align:center;">SIN DIRECCIONES REGISTRADAS</div>' :
                                    allStaff.map(s => {
                                        const cleanSearchText = \\\`\\\${\s.name} \\\${\s.address} \\\${\s.sector || ''}\\\`.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
                                        return \\\`
                                            <div class="staff-home-row" data-search-text="\\\${cleanSearchText}" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:8px 10px; border-radius:10px; border:1px solid rgba(255,255,255,0.05); gap:8px; transition:all 0.2s ease;">
                                                <div style="min-width:0;">
                                                    <div style="font-size:0.7rem; font-weight:900; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">\\\${\s.name}</div>
                                                    <div style="font-size:0.55rem; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">\\\${\s.address}</div>
                                                </div>
                                                <button id="home-btn-\\\${\s.name.replace(/\\s/g,'_')}" class="btn btn-sm" disabled style="padding:4px 8px; font-size:0.6rem; border-radius:6px; background:#22c55e; color:#fff; opacity:0.4; flex-shrink:0;">VER</button>
                                            </div>
                                        \\\`;
                                    }).join('')
                                }
                            </div>
                            <div id="geocoding-status-indicator" style="font-size:0.55rem; color:var(--muted); margin-top:10px; text-align:center;">📍 Procesando direcciones...</div>
                        \`;
                        sidePanel.appendChild(domDiv);`;

const replaceDomicilios = `                        domDiv.innerHTML = \`
                            <h3 style="font-size:0.8rem; color:#22c55e; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="const content = document.getElementById('domicilios-content'); const icon = document.getElementById('domicilios-icon'); if(content.style.display==='none'){content.style.display='block'; icon.textContent='▲';}else{content.style.display='none'; icon.textContent='▼';}">
                                <span>🏠 DOMICILIOS DEL PERSONAL</span>
                                <div>
                                    <span style="font-size:0.6rem; background:#22c55e; color:white; padding:2px 8px; border-radius:10px; margin-right:5px;">\${allStaff.length}</span>
                                    <span id="domicilios-icon">▼</span>
                                </div>
                            </h3>
                            <div id="domicilios-content" style="display:none;">
                                <div style="position:relative; margin-bottom:12px;">
                                    <input type="text" id="staff-home-search" placeholder="Buscar empleado o sector..." 
                                        style="width:100%; padding:8px 12px 8px 30px; font-size:0.65rem; color:#fff; background:rgba(255,255,255,0.03); border:1px solid rgba(34,197,94,0.15); border-radius:10px; outline:none; transition:all 0.3s ease; box-sizing:border-box;"
                                        onfocus="this.style.border='1px solid #22c55e'; this.style.background='rgba(255,255,255,0.06)'; this.style.boxShadow='0 0 8px rgba(34,197,94,0.2)';"
                                        onblur="this.style.border='1px solid rgba(34,197,94,0.15)'; this.style.background='rgba(255,255,255,0.03)'; this.style.boxShadow='none';" />
                                    <span style="position:absolute; left:10px; top:50%; transform:translateY(-50%); font-size:0.65rem; color:rgba(34,197,94,0.6); pointer-events:none;">🔍</span>
                                </div>
                                <div id="staff-home-list" style="display:flex; flex-direction:column; gap:6px; max-height:220px; overflow-y:auto;">
                                    \${allStaff.length === 0 ? '<div style="font-size:0.6rem;color:var(--muted);text-align:center;">SIN DIRECCIONES REGISTRADAS</div>' :
                                        allStaff.map(s => {
                                            const cleanSearchText = \\\`\\\${\s.name} \\\${\s.address} \\\${\s.sector || ''}\\\`.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
                                            return \\\`
                                                <div class="staff-home-row" data-search-text="\\\${cleanSearchText}" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:8px 10px; border-radius:10px; border:1px solid rgba(255,255,255,0.05); gap:8px; transition:all 0.2s ease;">
                                                    <div style="min-width:0;">
                                                        <div style="font-size:0.7rem; font-weight:900; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">\\\${\s.name}</div>
                                                        <div style="font-size:0.55rem; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">\\\${\s.address}</div>
                                                    </div>
                                                    <button id="home-btn-\\\${\s.name.replace(/\\s/g,'_')}" class="btn btn-sm" disabled style="padding:4px 8px; font-size:0.6rem; border-radius:6px; background:#22c55e; color:#fff; opacity:0.4; flex-shrink:0;">VER</button>
                                                </div>
                                            \\\`;
                                        }).join('')
                                    }
                                </div>
                                <div id="geocoding-status-indicator" style="font-size:0.55rem; color:var(--muted); margin-top:10px; text-align:center;">📍 Procesando direcciones...</div>
                            </div>
                        \`;
                        const equiposCard = document.getElementById('equipos-activos-card');
                        if (equiposCard) {
                            sidePanel.insertBefore(domDiv, equiposCard);
                        } else {
                            sidePanel.appendChild(domDiv);
                        }`;

if (!content.includes(targetEquipos)) {
    console.log("Could not find exact targetEquipos! Trying to replace directly anyway.");
    console.log("Content fragment:", content.substring(content.indexOf('<!-- SECCIÓN EQUIPOS / ACTIVOS -->'), content.indexOf('<!-- SECCIÓN EQUIPOS / ACTIVOS -->') + 500));
} else {
    content = content.replace(targetEquipos, replaceEquipos);
    console.log("Replaced Equipos successfully.");
}

if (!content.includes(targetDomicilios)) {
    console.log("Could not find exact targetDomicilios!");
} else {
    content = content.replace(targetDomicilios, replaceDomicilios);
    console.log("Replaced Domicilios successfully.");
}

fs.writeFileSync('frontend/index.html', content);
