import re

file_path = '/Users/nelsoncarrillokosak/valet-eye/frontend/index.html'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace Scripts in Head
content = content.replace(
    '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />\n    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>',
    '<script src="https://maps.googleapis.com/maps/api/js?key=TU_API_KEY_AQUI"></script>'
)

# 2. Replace centerMapOn
old_center = """    window.centerMapOn = function(lat, lon) {
        if (window.leafletMap) {
            window.leafletMap.setView([lat, lon], 17);
        }
    }"""
new_center = """    window.centerMapOn = function(lat, lon) {
        if (window.googleMap) {
            window.googleMap.setCenter({lat: parseFloat(lat), lng: parseFloat(lon)});
            window.googleMap.setZoom(17);
        } else if (window.leafletMap) {
            window.leafletMap.setView([lat, lon], 17);
        }
    }"""
content = content.replace(old_center, new_center)

# 3. Replace Leaflet Map initialization and Marker Logic
old_leaflet_init = """            // Inicializar Leaflet
            setTimeout(async () => {
                const map = L.map('map', { zoomControl: false }).setView([10.4806, -66.8983], 13); // Caracas default
                window.leafletMap = map;
                
                L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                    attribution: '&copy; OpenStreetMap &copy; CARTO'
                }).addTo(map);

                L.control.zoom({ position: 'bottomright' }).addTo(map);

                // Agregar markers de Personal (Azules)
                locations.staff.forEach(s => {
                    const marker = L.circleMarker([s.latitude, s.longitude], {
                        radius: 8,
                        fillColor: "#6366f1",
                        color: "#fff",
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.8
                    }).addTo(map);
                    marker.bindPopup(`<b>${s.name.toUpperCase()}</b><br>${s.role}`);
                });

                // Agregar markers de Assets (Violetas)
                locations.assets.forEach(a => {
                    const marker = L.circleMarker([a.latitude, a.longitude], {
                        radius: 8,
                        fillColor: "#a855f7",
                        color: "#fff",
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.8
                    }).addTo(map);
                    marker.bindPopup(`<b>${a.name.toUpperCase()}</b><br>${a.type}`);
                });

                if (locations.staff.length > 0 || locations.assets.length > 0) {
                    const group = new L.featureGroup([...locations.staff, ...locations.assets].map(x => L.marker([x.latitude, x.longitude])));
                    map.fitBounds(group.getBounds().pad(0.2));
                }

                // ── DOMICILIOS: Geocodificar direcciones del personal con caché local y reintentos inteligentes ──
                const homeMarkersLayer = L.layerGroup().addTo(map);
                window._staffHomeMarkers = [];

                // ── UBICACIONES EN TIEMPO REAL (vía WhatsApp) ──
                const liveLocLayer = L.layerGroup().addTo(map);
                window._liveLocMarkers = {};

                async function refreshLiveLocations() {
                    try {
                        const res = await apiFetch('/api/staff/live-locations');
                        const locs = res.locations || [];

                        // Limpiar pines anteriores
                        liveLocLayer.clearLayers();
                        window._liveLocMarkers = {};

                        locs.forEach(loc => {
                            const liveIcon = L.divIcon({
                                html: `
                                    <div style="position:relative; width:16px; height:16px;">
                                        <div style="width:16px; height:16px; background:#4285f4; border:2px solid #fff; border-radius:50%; box-shadow:0 0 8px rgba(66,133,244,0.9); z-index:2; position:absolute; left:0; top:0; display:flex; align-items:center; justify-content:center; font-size:8px;">📍</div>
                                        <div style="position:absolute; left:-5px; top:-5px; width:26px; height:26px; border-radius:50%; border:2px solid #4285f4; background:transparent; opacity:0; z-index:1; animation: marker-pulse 1.4s infinite ease-out;"></div>
                                    </div>
                                `,
                                iconSize: [16, 16],
                                iconAnchor: [8, 8],
                                className: ''
                            });

                            const minutesAgo = Math.round((Date.now() - new Date(loc.updated_at + 'Z').getTime()) / 60000);
                            const timeLabel = minutesAgo < 1 ? 'Ahora mismo' : `hace ${minutesAgo} min`;

                            const marker = L.marker([loc.lat, loc.lon], { icon: liveIcon }).addTo(liveLocLayer);
                            marker.bindTooltip(`
                                <div style="min-width:180px; font-family:var(--font-main);">
                                    <div style="font-weight:900; font-size:0.75rem; color:#4285f4; margin-bottom:5px;">📍 ${loc.name}</div>
                                    <div style="font-size:0.6rem; color:#cbd5e1;"><b>GPS en vivo</b> · ${timeLabel}</div>
                                    ${loc.accuracy ? `<div style="font-size:0.55rem; color:var(--muted);">Precisión: ±${Math.round(loc.accuracy)}m</div>` : ''}
                                </div>
                            `, { direction: 'top', className: 'premium-leaflet-tooltip', opacity: 0.98 });

                            window._liveLocMarkers[loc.phone] = marker;
                        });

                        // Actualizar badge en el panel de Personal en Campo
                        const livePanel = document.getElementById('live-gps-badge');
                        if (livePanel) {
                            livePanel.textContent = locs.length;
                            livePanel.style.display = locs.length > 0 ? 'inline-block' : 'none';
                        }

                        // Actualizar sección GPS en vivo del panel lateral
                        const liveListEl = document.getElementById('live-gps-list');
                        if (liveListEl) {
                            if (locs.length === 0) {
                                liveListEl.innerHTML = '<div style="font-size:0.6rem; color:var(--muted); text-align:center; padding:8px;">Sin ubicaciones activas</div>';
                            } else {
                                liveListEl.innerHTML = locs.map(loc => {
                                    const minutesAgo = Math.round((Date.now() - new Date(loc.updated_at + 'Z').getTime()) / 60000);
                                    const timeLabel = minutesAgo < 1 ? 'Ahora' : `${minutesAgo}m`;
                                    return `<div style="display:flex; justify-content:space-between; align-items:center; background:rgba(66,133,244,0.08); padding:8px 10px; border-radius:10px; border:1px solid rgba(66,133,244,0.2); gap:8px; cursor:pointer;" onclick="window._liveLocMarkers['${loc.phone}'] && (window.leafletMap.setView([${loc.lat},${loc.lon}],16), window._liveLocMarkers['${loc.phone}'].openTooltip())">
                                        <div style="min-width:0;">
                                            <div style="font-size:0.7rem; font-weight:900; color:#4285f4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${loc.name}</div>
                                            <div style="font-size:0.55rem; color:var(--muted);">GPS · ${timeLabel}</div>
                                        </div>
                                        <button style="padding:4px 8px; font-size:0.6rem; border-radius:6px; background:#4285f4; color:#fff; flex-shrink:0; border:none; cursor:pointer;">VER</button>
                                    </div>`;
                                }).join('');
                            }
                        }
                    } catch(e) { console.warn('Error cargando ubicaciones en vivo:', e); }
                }

                // Polling cada 30 segundos
                refreshLiveLocations();
                const liveLocInterval = setInterval(refreshLiveLocations, 30000);
                window._liveLocInterval = liveLocInterval;"""

new_gmaps_init = """            // Inicializar Google Maps
            setTimeout(async () => {
                const mapOptions = {
                    center: { lat: 10.4806, lng: -66.8983 },
                    zoom: 13,
                    disableDefaultUI: true,
                    zoomControl: true,
                    zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
                    styles: [
                        { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
                        { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
                        { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
                        { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
                        { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
                        { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
                        { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] }
                    ]
                };
                const map = new google.maps.Map(document.getElementById('map'), mapOptions);
                window.googleMap = map;
                
                const bounds = new google.maps.LatLngBounds();
                const infoWindow = new google.maps.InfoWindow();

                // Agregar markers de Personal (Azules)
                locations.staff.forEach(s => {
                    const pos = { lat: parseFloat(s.latitude), lng: parseFloat(s.longitude) };
                    const marker = new google.maps.Marker({
                        position: pos,
                        map: map,
                        icon: {
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: 8,
                            fillColor: "#6366f1",
                            fillOpacity: 0.8,
                            strokeColor: "#fff",
                            strokeWeight: 2
                        }
                    });
                    marker.addListener('click', () => {
                        infoWindow.setContent(`<div style="color:#000;"><b>${s.name.toUpperCase()}</b><br>${s.role}</div>`);
                        infoWindow.open(map, marker);
                    });
                    bounds.extend(pos);
                });

                // Agregar markers de Assets (Violetas)
                locations.assets.forEach(a => {
                    const pos = { lat: parseFloat(a.latitude), lng: parseFloat(a.longitude) };
                    const marker = new google.maps.Marker({
                        position: pos,
                        map: map,
                        icon: {
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: 8,
                            fillColor: "#a855f7",
                            fillOpacity: 0.8,
                            strokeColor: "#fff",
                            strokeWeight: 2
                        }
                    });
                    marker.addListener('click', () => {
                        infoWindow.setContent(`<div style="color:#000;"><b>${a.name.toUpperCase()}</b><br>${a.type}</div>`);
                        infoWindow.open(map, marker);
                    });
                    bounds.extend(pos);
                });

                if (locations.staff.length > 0 || locations.assets.length > 0) {
                    map.fitBounds(bounds);
                }

                window._staffHomeMarkers = [];
                window._liveLocMarkers = {};
                window._liveLocMarkersArray = [];

                async function refreshLiveLocations() {
                    try {
                        const res = await apiFetch('/api/staff/live-locations');
                        const locs = res.locations || [];

                        // Limpiar pines anteriores
                        (window._liveLocMarkersArray || []).forEach(m => m.setMap(null));
                        window._liveLocMarkersArray = [];
                        window._liveLocMarkers = {};

                        locs.forEach(loc => {
                            const liveIconSvg = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="8" fill="#4285f4" stroke="#fff" stroke-width="2"/></svg>');
                            
                            const marker = new google.maps.Marker({
                                position: { lat: parseFloat(loc.lat), lng: parseFloat(loc.lon) },
                                map: map,
                                icon: { url: liveIconSvg, scaledSize: new google.maps.Size(24, 24) },
                                title: loc.name
                            });

                            const minutesAgo = Math.round((Date.now() - new Date(loc.updated_at + 'Z').getTime()) / 60000);
                            const timeLabel = minutesAgo < 1 ? 'Ahora mismo' : `hace ${minutesAgo} min`;

                            const contentString = `
                                <div style="min-width:180px; font-family:var(--font-main); color:#000;">
                                    <div style="font-weight:900; font-size:0.75rem; color:#4285f4; margin-bottom:5px;">📍 ${loc.name}</div>
                                    <div style="font-size:0.6rem; color:#333;"><b>GPS en vivo</b> · ${timeLabel}</div>
                                    ${loc.accuracy ? `<div style="font-size:0.55rem; color:#666;">Precisión: ±${Math.round(loc.accuracy)}m</div>` : ''}
                                </div>
                            `;
                            
                            marker.addListener('click', () => {
                                infoWindow.setContent(contentString);
                                infoWindow.open(map, marker);
                            });
                            
                            marker.openTooltip = () => {
                                infoWindow.setContent(contentString);
                                infoWindow.open(map, marker);
                            };

                            window._liveLocMarkersArray.push(marker);
                            window._liveLocMarkers[loc.phone] = marker;
                        });

                        // Actualizar badge en el panel de Personal en Campo
                        const livePanel = document.getElementById('live-gps-badge');
                        if (livePanel) {
                            livePanel.textContent = locs.length;
                            livePanel.style.display = locs.length > 0 ? 'inline-block' : 'none';
                        }

                        // Actualizar sección GPS en vivo del panel lateral
                        const liveListEl = document.getElementById('live-gps-list');
                        if (liveListEl) {
                            if (locs.length === 0) {
                                liveListEl.innerHTML = '<div style="font-size:0.6rem; color:var(--muted); text-align:center; padding:8px;">Sin ubicaciones activas</div>';
                            } else {
                                liveListEl.innerHTML = locs.map(loc => {
                                    const minutesAgo = Math.round((Date.now() - new Date(loc.updated_at + 'Z').getTime()) / 60000);
                                    const timeLabel = minutesAgo < 1 ? 'Ahora' : `${minutesAgo}m`;
                                    return `<div style="display:flex; justify-content:space-between; align-items:center; background:rgba(66,133,244,0.08); padding:8px 10px; border-radius:10px; border:1px solid rgba(66,133,244,0.2); gap:8px; cursor:pointer;" onclick="window._liveLocMarkers['${loc.phone}'] && (window.googleMap.setCenter({lat:${loc.lat},lng:${loc.lon}}), window.googleMap.setZoom(16), window._liveLocMarkers['${loc.phone}'].openTooltip())">
                                        <div style="min-width:0;">
                                            <div style="font-size:0.7rem; font-weight:900; color:#4285f4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${loc.name}</div>
                                            <div style="font-size:0.55rem; color:var(--muted);">GPS · ${timeLabel}</div>
                                        </div>
                                        <button style="padding:4px 8px; font-size:0.6rem; border-radius:6px; background:#4285f4; color:#fff; flex-shrink:0; border:none; cursor:pointer;">VER</button>
                                    </div>`;
                                }).join('');
                            }
                        }
                    } catch(e) { console.warn('Error cargando ubicaciones en vivo:', e); }
                }

                refreshLiveLocations();
                const liveLocInterval = setInterval(refreshLiveLocations, 30000);
                window._liveLocInterval = liveLocInterval;"""

content = content.replace(old_leaflet_init, new_gmaps_init)

# 4. Replace addHomeMarker Leaflet logic
old_home_marker = """                function addHomeMarker(lat, lon, name, address, sector) {
                    // Evitar duplicación exacta agregando un micro-jitter muy sutil (±30 metros) para agrupar visualmente
                    const jitterLat = lat + (Math.random() - 0.5) * 0.004;
                    const jitterLon = lon + (Math.random() - 0.5) * 0.004;

                    // Icono verde titilante (pulsante) que va creciendo
                    const customHomeIcon = L.divIcon({
                        html: `
                            <div style="position:relative; width:12px; height:12px;">
                                <div style="width:12px; height:12px; background:#22c55e; border:2px solid #fff; border-radius:50%; box-shadow:0 0 6px rgba(34,197,94,0.8); z-index:2; position:absolute; left:0; top:0;"></div>
                                <div style="position:absolute; left:-4px; top:-4px; width:20px; height:20px; border-radius:50%; border:2px solid #22c55e; background:transparent; opacity:0; z-index:1; animation: marker-pulse 1.8s infinite ease-out;"></div>
                            </div>
                        `,
                        iconSize: [12, 12],
                        iconAnchor: [6, 6],
                        className: ''
                    });

                    const marker = L.marker([jitterLat, jitterLon], { icon: customHomeIcon }).addTo(homeMarkersLayer);
                    
                    // Globo premium interactivo al pasar el cursor (tooltip)
                    marker.bindTooltip(`
                        <div style="min-width:180px; font-family:var(--font-main);">
                            <div style="font-weight:900; font-size:0.75rem; color:#22c55e; margin-bottom:5px; display:flex; align-items:center; gap:4px;">
                                🏠 ${name}
                            </div>
                            <div style="font-size:0.6rem; color:#cbd5e1; line-height:1.3;"><b>Dirección:</b> ${address}</div>
                            ${sector ? `<div style="font-size:0.6rem; color:#cbd5e1; margin-top:2px;"><b>Sector:</b> ${sector}</div>` : ''}
                        </div>
                    `, {
                        direction: 'top',
                        className: 'premium-leaflet-tooltip',
                        opacity: 0.98
                    });

                    window._staffHomeMarkers.push({ name, lat: jitterLat, lon: jitterLon, marker });

                    // Actualizar el botón VER en la lista lateral
                    const btn = document.getElementById(`home-btn-${name.replace(/\s/g,'_')}`);
                    if (btn) {
                        btn.onclick = () => { 
                            map.setView([jitterLat, jitterLon], 16); 
                            marker.openTooltip(); 
                        };
                        btn.disabled = false;
                        btn.style.opacity = '1';
                    }
                }"""

new_home_marker = """                function addHomeMarker(lat, lon, name, address, sector) {
                    const jitterLat = lat + (Math.random() - 0.5) * 0.004;
                    const jitterLon = lon + (Math.random() - 0.5) * 0.004;

                    const homeIconSvg = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="6" fill="#22c55e" stroke="#fff" stroke-width="2"/></svg>');

                    const marker = new google.maps.Marker({
                        position: { lat: jitterLat, lng: jitterLon },
                        map: window.googleMap,
                        icon: { url: homeIconSvg, scaledSize: new google.maps.Size(20, 20) },
                        title: name
                    });
                    
                    const contentString = `
                        <div style="min-width:180px; font-family:var(--font-main); color:#000;">
                            <div style="font-weight:900; font-size:0.75rem; color:#22c55e; margin-bottom:5px; display:flex; align-items:center; gap:4px;">
                                🏠 ${name}
                            </div>
                            <div style="font-size:0.6rem; color:#333; line-height:1.3;"><b>Dirección:</b> ${address}</div>
                            ${sector ? `<div style="font-size:0.6rem; color:#333; margin-top:2px;"><b>Sector:</b> ${sector}</div>` : ''}
                        </div>
                    `;
                    const infoW = new google.maps.InfoWindow({ content: contentString });
                    marker.addListener('click', () => { infoW.open(window.googleMap, marker); });
                    
                    marker.openTooltip = () => { infoW.open(window.googleMap, marker); };

                    window._staffHomeMarkers.push({ name, lat: jitterLat, lon: jitterLon, marker });

                    const btn = document.getElementById(`home-btn-${name.replace(/\s/g,'_')}`);
                    if (btn) {
                        btn.onclick = () => { 
                            window.googleMap.setCenter({ lat: jitterLat, lng: jitterLon });
                            window.googleMap.setZoom(16); 
                            marker.openTooltip(); 
                        };
                        btn.disabled = false;
                        btn.style.opacity = '1';
                    }
                }"""

content = content.replace(old_home_marker, new_home_marker)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Patch applied.")
