// ThingsBoard Konfiguracija
const TB_HOST = 'eu.thingsboard.cloud';
let TB_DEVICE_ID = localStorage.getItem('TB_DEVICE_ID') || '1043c890-3256-11f1-b641-ab83ce7b9a6f';
let TB_JWT_TOKEN = '';
let tbPollingInterval;
let tbLastUpdateTs = {};
let isFirstFetch = true;

let sensors = [{
    id: 'sensor_1',
    name: 'EnvioNode Device',
    lat: 45.5550, // default general location
    lng: 18.6761,
    temp: '--',
    hum: '--',
    pm1: '--',
    pm25: '--',
    pm10: '--',
    voc: '--',
    nox: '--',
    co2: '--',
    last_update: '--:--:--'
}];
let currentSensorId = 'sensor_1';
let map;
let mapMarkers = {};

const ALL_DEVICES = [
    { id: "1043c890-3256-11f1-b641-ab83ce7b9a6f", name: "Enviodev device 1", lat: 45.555, lng: 18.676 },
    { id: "1df04d60-3256-11f1-a3ea-950631e217c8", name: "Enviodev device 2", lat: 45.555, lng: 18.676 },
    { id: "2b8f8bc0-3256-11f1-b641-ab83ce7b9a6f", name: "Enviodev device 3", lat: 45.555, lng: 18.676 },
    { id: "427b7740-3256-11f1-b641-ab83ce7b9a6f", name: "Enviodev device 4", lat: 45.555, lng: 18.676 },
    { id: "4bfaf430-3256-11f1-b641-ab83ce7b9a6f", name: "Enviodev device 5", lat: 45.555, lng: 18.676 }
];

// Global Helpers
function formatDDMMYYYY_HHMMSS(dateObj) {
    const d = new Date(dateObj);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

function formatDDMMYYYY(dateObj) {
    const d = new Date(dateObj);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

function parseTBVal(val) {
    try {
        return typeof val === 'string' ? JSON.parse(val.replace(/[“”]/g, '"')) : val;
    } catch(e) {
        return {};
    }
}

function parseNMEA(coordStr, direction) {
    if (!coordStr) return null;
    let parts = coordStr.split('.');
    let intPart = parts[0];
    if (intPart.length < 3) return parseFloat(coordStr);
    
    let degrees = parseInt(intPart.slice(0, -2), 10);
    let minutesStr = intPart.slice(-2) + '.' + (parts[1] || '0');
    let minutes = parseFloat(minutesStr);
    
    let decimal = degrees + (minutes / 60);
    if (direction === 'S' || direction === 'W') decimal = -decimal;
    
    return decimal;
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('device-select');
    if (select) {
        select.value = TB_DEVICE_ID;
        // Dynamically override sensor name based on currently selected drop-down text
        if (select.selectedIndex !== -1) {
            sensors[0].name = select.options[select.selectedIndex].text;
        }
    }
    
    initMap();
    startThingsBoardConnection();
});

function initMap() {
    // Initialize map centered on the general location
    map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView([45.5550, 18.6761], 13);

    // Google Satellite Hybrid Tiles
    const satelliteUrl = 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
    const subdomains = ['mt0', 'mt1', 'mt2', 'mt3'];

    L.tileLayer(satelliteUrl, {
        maxZoom: 20,
        subdomains: subdomains
    }).addTo(map);

    // Render transparent interactive markers for all devices
    ALL_DEVICES.forEach(dev => {
        let m = L.marker([dev.lat, dev.lng]).addTo(map);
        m.on('click', () => {
            const select = document.getElementById('device-select');
            if (select) {
                select.value = dev.id;
                changeDevice();
            }
        });
        mapMarkers[dev.id] = m;
    });

    highlightActiveMarker();
    
    window.addEventListener('themeChanged', (e) => {
        // Keep satellite view regardless of theme for consistency
    });

    // Force Leaflet to recalculate map dimensions safely
    setTimeout(() => {
        if (map) map.invalidateSize();
    }, 500);
}

function highlightActiveMarker() {
    Object.keys(mapMarkers).forEach(id => {
        const m = mapMarkers[id];
        if (id === TB_DEVICE_ID) {
            m.setOpacity(1.0);
            m.setZIndexOffset(1000);
            map.panTo(m.getLatLng()); // Move naturally to newly active dot
        } else {
            m.setOpacity(0.4);
            m.setZIndexOffset(0);
        }
    });
}

function changeDevice() {
    const select = document.getElementById('device-select');
    if (!select) return;
    TB_DEVICE_ID = select.value;
    localStorage.setItem('TB_DEVICE_ID', TB_DEVICE_ID);
    
    // Automatically apply selected drop-down text directly to UI
    sensors[0].name = select.options[select.selectedIndex].text;
    
    // Reset sve
    tbLastUpdateTs = {};
    isFirstFetch = true;
    sensors[0].temp = '--';
    sensors[0].hum = '--';
    sensors[0].pm1 = '--';
    sensors[0].pm25 = '--';
    sensors[0].pm10 = '--';
    sensors[0].voc = '--';
    sensors[0].nox = '--';
    sensors[0].co2 = '--';
    sensors[0].lat = 45.5550; // reset koordinata on switch
    sensors[0].lng = 18.6761; 
    
    document.getElementById('last-update').innerText = '--:--:--';
    highlightActiveMarker();
    updateDashboard();
    
    // Započni ispočetka polling i iscrtavanje
    if(tbPollingInterval) clearInterval(tbPollingInterval);
    if(TB_JWT_TOKEN) {
        fetchThingsBoardData();
        tbPollingInterval = setInterval(fetchThingsBoardData, 5000);
    }
}



async function startThingsBoardConnection() {
    const btn = document.getElementById('tb-login-btn');
    if (btn) btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Spajanje...`;
    
    let enteredPassword = "";
    
    // Provjeri postoji li lozinka u config.js (lokalna verzija)
    if (typeof TB_PASSWORD_SECRET !== 'undefined' && TB_PASSWORD_SECRET !== "TVOJA_NOVA_LOZINKA_OVDJE") {
        enteredPassword = TB_PASSWORD_SECRET;
    } else {
        enteredPassword = prompt("Authentication Required: Please enter your ThingsBoard Access Password:");
    }

    if (!enteredPassword) {
        if (btn) btn.innerHTML = `<i class="fas fa-times"></i> Access Denied`;
        return;
    }

    const credentials = {
        "username": "antonio.antunovic@ferit.hr",
        "password": enteredPassword 
    };

    try {
        const response = await fetch(`https://${TB_HOST}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(credentials)
        });

        if (response.ok) {
            const data = await response.json();
            TB_JWT_TOKEN = data.token; 
            
            if (btn) {
                btn.innerHTML = `<i class="fas fa-check"></i> Connected & Live`;
                btn.style.background = "rgba(0, 230, 118, 0.2)";
                btn.style.color = "#00e676";
                btn.style.borderColor = "rgba(0, 230, 118, 0.4)";
                btn.disabled = true;
            }
            if (document.getElementById('online-status')) {
                document.getElementById('online-status').style.opacity = '1';
            }
            
            await fetchThingsBoardData();
            updateAllLocations();
            
            if (tbPollingInterval) clearInterval(tbPollingInterval);
            tbPollingInterval = setInterval(() => {
                fetchThingsBoardData();
                updateAllLocations();
            }, 5000);
        } else {
            console.error("Greška kod prijave na ThingsBoard:", response.status);
            if (btn) {
                btn.innerHTML = `<i class="fas fa-times"></i> Odbijen pristup`;
                btn.style.background = "rgba(255, 23, 68, 0.2)";
                btn.style.color = "#ff1744";
            }
        }
    } catch (error) {
        console.error('Došlo je do greške:', error);
        if (btn) {
            btn.innerHTML = `<i class="fas fa-wifi"></i> Greška mreže`;
            btn.style.background = "rgba(255, 23, 68, 0.2)";
            btn.style.color = "#ff1744";
        }
    }
}

async function updateAllLocations() {
    if (!TB_JWT_TOKEN) return;
    
    const endTs = Date.now();
    const startTs = endTs - (24 * 60 * 60 * 1000);
    const oneMinuteAgo = endTs - (60 * 1000);
    
    ALL_DEVICES.forEach(async (dev) => {
        // We fetch the latest BME688 timestamp as a proxy for "Activity"
        const url = `https://${TB_HOST}/api/plugins/telemetry/DEVICE/${dev.id}/values/timeseries?keys=BME688,GNSS&startTs=${startTs}&endTs=${endTs}&limit=1`;
        try {
            const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${TB_JWT_TOKEN}` } });
            if (resp.ok) {
                const data = await resp.json();
                
                // 1. Handle Map Location if GNSS exists
                if (data.GNSS && data.GNSS.length > 0 && dev.id !== TB_DEVICE_ID) {
                    let gnss = parseTBVal(data.GNSS[0].value);
                    if (gnss.Latitude && gnss.Longitude) {
                        let lat = parseNMEA(gnss.Latitude, gnss.latDirection);
                        let lon = parseNMEA(gnss.Longitude, gnss.lonDirection);
                        if (lat !== null && lon !== null && mapMarkers[dev.id]) {
                            mapMarkers[dev.id].setLatLng([lat, lon]);
                        }
                    }
                }

                // 2. Update Dropdown Status Text
                let lastTs = 0;
                // Combine all possible keys to find the absolute latest packet
                Object.keys(data).forEach(key => {
                    if (data[key] && data[key][0].ts > lastTs) lastTs = data[key][0].ts;
                });

                const isActive = lastTs > oneMinuteAgo;
                updateDropdownItemStatus(dev.id, dev.name, isActive);
            }
        } catch (e) {
            console.warn("Status/Loc check error: ", e);
        }
    });
}

function updateDropdownItemStatus(deviceId, baseName, isActive) {
    const select = document.getElementById('device-select');
    if (!select) return;

    for (let i = 0; i < select.options.length; i++) {
        const opt = select.options[i];
        if (opt.value === deviceId) {
            const statusText = isActive ? "● Online" : "○ Offline";
            opt.text = `${baseName} (${statusText})`;
            opt.style.color = isActive ? "#00e676" : "#ff1744"; // Green for active, Red for inactive
            break;
        }
    }
}

async function fetchThingsBoardData() {
    if (!TB_JWT_TOKEN) return;

    // Uzmi podatak (1 je dosta za pregled domaceg zaslona, nemamo graph ovdje)
    const limit = 1;
    const endTs = Date.now();
    const startTs = endTs - (10 * 60 * 1000); // zadnjih 10 minuta
    
    // Dohvaćamo sve potrebne podatke iz telemetrije
    const url = `https://${TB_HOST}/api/plugins/telemetry/DEVICE/${TB_DEVICE_ID}/values/timeseries?keys=BME688,GNSS,NEXTPM,SCD30,SENSORTECH,SGP41,SHT31&startTs=${startTs}&endTs=${endTs}&limit=${limit}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TB_JWT_TOKEN}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            
            if (isFirstFetch) {
                // Extracts highest entry point for elements
                const keys = ['BME688', 'GNSS', 'NEXTPM', 'SCD30', 'SENSORTECH', 'SGP41', 'SHT31'];
                
                let latestObj = {};
                keys.forEach(key => {
                    if (data[key] && data[key].length > 0) {
                        latestObj[key] = [data[key][0]]; // TB returns newest first out-of-box with queries!
                    }
                });
                
                isFirstFetch = false;
                handleRealTimeTBData(latestObj); 
            } else {
                handleRealTimeTBData(data);
            }
        } else {
            console.error("ThingsBoard HTTP greška:", response.status, response.statusText);
        }
    } catch (error) {
        console.error("Greška pri dohvaćanju ThingsBoard telemetrije:", error);
    }
}

function handleRealTimeTBData(tbData) {
    const sensor = sensors.find(s => s.id === currentSensorId);
    if (!sensor) return;

    let hasChanges = false;

    // --- GNSS Senzor (Lokacija) ---
    if (tbData.GNSS && tbData.GNSS.length > 0) {
        if (tbData.GNSS[0].ts !== tbLastUpdateTs.GNSS) {
            tbLastUpdateTs.GNSS = tbData.GNSS[0].ts;
            let gnss = parseTBVal(tbData.GNSS[0].value);
            if (gnss.Latitude !== "" && gnss.Longitude !== "") {
                let lat = parseNMEA(gnss.Latitude, gnss.latDirection);
                let lon = parseNMEA(gnss.Longitude, gnss.lonDirection);
                if (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)) {
                    sensor.lat = lat;
                    sensor.lng = lon;
                }
            }
            hasChanges = true;
        }
    }

    // --- SCD30 Senzor (CO2) ---
    if (tbData.SCD30 && tbData.SCD30.length > 0) {
        if (tbData.SCD30[0].ts !== tbLastUpdateTs.SCD30) {
            tbLastUpdateTs.SCD30 = tbData.SCD30[0].ts;
            let scd = parseTBVal(tbData.SCD30[0].value);
            if (scd.CO2 !== undefined) {
                sensor.co2 = parseFloat(scd.CO2).toFixed(1);
            }
            hasChanges = true;
        }
    }

    // --- SHT31 Senzor (Temperatura / Vlaga) ---
    if (tbData.SHT31 && tbData.SHT31.length > 0) {
        if (tbData.SHT31[0].ts !== tbLastUpdateTs.SHT31) {
            tbLastUpdateTs.SHT31 = tbData.SHT31[0].ts;
            let sht = parseTBVal(tbData.SHT31[0].value);
            if (sht.temperature !== undefined) {
                sensor.temp = parseFloat(sht.temperature).toFixed(1);
            }
            if (sht.humidity !== undefined) {
                sensor.hum = parseFloat(sht.humidity).toFixed(1);
            }
            hasChanges = true;
        }
    }
    
    // --- NEXTPM Senzor (Čestice zraka) ---
    if (tbData.NEXTPM && tbData.NEXTPM.length > 0) {
        if (tbData.NEXTPM[0].ts !== tbLastUpdateTs.NEXTPM) {
            tbLastUpdateTs.NEXTPM = tbData.NEXTPM[0].ts;
            let pm = parseTBVal(tbData.NEXTPM[0].value);
            if (pm["PM1(ug/m3)"] !== undefined) sensor.pm1 = parseFloat(pm["PM1(ug/m3)"]).toFixed(1);
            if (pm["PM2_5(ug/m3)"] !== undefined) sensor.pm25 = parseFloat(pm["PM2_5(ug/m3)"]).toFixed(1);
            if (pm["PM10(ug/m3)"] !== undefined) sensor.pm10 = parseFloat(pm["PM10(ug/m3)"]).toFixed(1);
            hasChanges = true;
        }
    }

    // --- SGP41 Senzor (Plinovi) ---
    if (tbData.SGP41 && tbData.SGP41.length > 0) {
        if (tbData.SGP41[0].ts !== tbLastUpdateTs.SGP41) {
            tbLastUpdateTs.SGP41 = tbData.SGP41[0].ts;
            let sgp = parseTBVal(tbData.SGP41[0].value);
            if (sgp.VOC_Index !== undefined) sensor.voc = parseInt(sgp.VOC_Index); 
            if (sgp.NOx_Index !== undefined) sensor.nox = parseInt(sgp.NOx_Index); 
            hasChanges = true;
        }
    }

    // --- BME688 Senzor (Rezerva ako SHT31 nema podatke) ---
    if (tbData.BME688 && tbData.BME688.length > 0) {
        if (tbData.BME688[0].ts !== tbLastUpdateTs.BME688) {
            tbLastUpdateTs.BME688 = tbData.BME688[0].ts;
            let bme = parseTBVal(tbData.BME688[0].value);
            // Ako temp još nije upisana, koristi ovu
            if (sensor.temp === '--' && bme.temperature !== undefined) sensor.temp = parseFloat(bme.temperature).toFixed(1);
            if (sensor.hum === '--' && bme.humidity !== undefined) sensor.hum = parseFloat(bme.humidity).toFixed(1);
            hasChanges = true;
        }
    }

    if (hasChanges) {
        sensor.last_update = formatDDMMYYYY_HHMMSS(new Date());
        updateDashboard(); 
    }
}



function updateDashboard() {
    const sensor = sensors.find(s => s.id === currentSensorId);
    if (!sensor) return;

    // Update Header
    document.getElementById('current-sensor-name').innerText = sensor.name;
    
    // Check if device is active (any sensor updated in last 60s)
    const nowTs = Date.now();
    const oneMinuteAgo = nowTs - (60 * 1000);
    let isDeviceActive = false;
    Object.values(tbLastUpdateTs).forEach(ts => {
        if (ts > oneMinuteAgo) isDeviceActive = true;
    });

    const updateLabel = document.getElementById('last-update').parentElement;
    if (isDeviceActive) {
        document.getElementById('last-update').innerText = sensor.last_update;
        updateLabel.style.display = 'block';
    } else {
        updateLabel.style.display = 'none';
    }
    
    // Global tracking of current active status
    window.isCurrentDeviceActive = isDeviceActive;

    // Update Stats
    if(document.getElementById('val-voc')) document.getElementById('val-voc').innerText = sensor.voc;
    if(document.getElementById('val-nox')) document.getElementById('val-nox').innerText = sensor.nox;
    if(document.getElementById('val-pm1')) document.getElementById('val-pm1').innerHTML = `${sensor.pm1} <span class="unit">µg/m³</span>`;
    if(document.getElementById('val-pm')) document.getElementById('val-pm').innerHTML = `${sensor.pm25} <span class="unit">µg/m³</span>`;
    if(document.getElementById('val-pm10')) document.getElementById('val-pm10').innerHTML = `${sensor.pm10} <span class="unit">µg/m³</span>`;
    if(document.getElementById('val-temp')) document.getElementById('val-temp').innerHTML = `${sensor.temp} <span class="unit">°C</span>`;
    if(document.getElementById('val-hum')) document.getElementById('val-hum').innerHTML = `${sensor.hum} <span class="unit">%</span>`;
    if(document.getElementById('val-co2')) document.getElementById('val-co2').innerHTML = `${sensor.co2 !== '--' ? sensor.co2 : '--'} <span class="unit">ppm</span>`;

    // Update Map correctly tracking ID dictionaries
    const newPos = [sensor.lat, sensor.lng];
    if(mapMarkers[TB_DEVICE_ID] && map) {
        mapMarkers[TB_DEVICE_ID].setLatLng(newPos);
        highlightActiveMarker(); // Enforces map.panTo strictly
        setTimeout(() => map.invalidateSize(), 300);
    }
}

function viewHistory(type) {
    if (!window.isCurrentDeviceActive) {
        showToast();
        return;
    }
    // Open historical trend page for current sensor and specific metric
    window.location.href = `history.html?sensor=${currentSensorId}&type=${type}`;
}

function openSensorDetail(sensorName) {
    if (!window.isCurrentDeviceActive) {
        showToast();
        return;
    }
    window.location.href = `sensor.html?sensor=${sensorName}`;
}

function showToast() {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
}

// ======================== CSV EXPORT LOGIC ==========================

function formatTimeInput(input) {
    // Strip everything except pure numbers
    let val = input.value.replace(/\D/g, '');
    
    // Auto-inject colon specifically at the threshold
    if (val.length > 2) {
        val = val.slice(0, 2) + ':' + val.slice(2, 4);
    }
    
    input.value = val;
}

function openExportModal() {
    document.getElementById('export-modal').style.display = 'flex';
    // set defaults (24 hours ago until now)
    const now = new Date();
    const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    
    // Format YYYY-MM-DD and HH:mm independently
    const formatDate = (d) => {
        return d.getFullYear() + "-" + 
               String(d.getMonth() + 1).padStart(2, '0') + "-" + 
               String(d.getDate()).padStart(2, '0');
    };
    const formatTime = (d) => {
        return String(d.getHours()).padStart(2, '0') + ":" + 
               String(d.getMinutes()).padStart(2, '0');
    };
    
    document.getElementById('export-start-date').value = formatDate(yesterday);
    document.getElementById('export-start-time').value = formatTime(yesterday);
    
    document.getElementById('export-end-date').value = formatDate(now);
    document.getElementById('export-end-time').value = formatTime(now);
    
    // Default the dropdown to whatever device is actively on the dashboard right now
    const sel = document.getElementById('export-device-select');
    if (sel) sel.value = TB_DEVICE_ID;
}

function closeExportModal() {
    document.getElementById('export-modal').style.display = 'none';
}

async function downloadCSV() {
    if (!TB_JWT_TOKEN) {
        alert("Wait until successfully connected to the Cloud!");
        return;
    }
    const btn = document.getElementById('download-btn-actual');
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Fetching...`;
    btn.disabled = true;

    const startDateStr = document.getElementById('export-start-date').value;
    const startTimeStr = document.getElementById('export-start-time').value;
    const endDateStr = document.getElementById('export-end-date').value;
    const endTimeStr = document.getElementById('export-end-time').value;
    
    if (!startDateStr || !startTimeStr || !endDateStr || !endTimeStr) { 
        alert("Please ensure both a date and a time are specified for Start and End ranges."); 
        btn.innerHTML = `<i class="fas fa-download"></i> Extract CSV`; 
        btn.disabled = false; 
        return; 
    }
    
    const startTs = new Date(`${startDateStr}T${startTimeStr}`).getTime();
    const endTs = new Date(`${endDateStr}T${endTimeStr}`).getTime();
    
    // We will ask TB to give us massive limits to cover historical scale fully. 
    const limit = 50000;
    const keys = 'BME688,GNSS,NEXTPM,SCD30,SENSORTECH,SGP41,SHT31';
    
    const selectedDeviceElement = document.getElementById('export-device-select');
    const specificDevice = selectedDeviceElement ? selectedDeviceElement.value : 'ALL';

    let targets = [];
    if (specificDevice === 'ALL') {
        targets = ALL_DEVICES;
    } else {
        const found = ALL_DEVICES.find(d => d.id === specificDevice);
        if (found) targets.push(found);
    }

    try {
        const fetchPromises = targets.map(device => {
            const url = `https://${TB_HOST}/api/plugins/telemetry/DEVICE/${device.id}/values/timeseries?keys=${keys}&startTs=${startTs}&endTs=${endTs}&limit=${limit}`;
            return fetch(url, { headers: { 'Authorization': `Bearer ${TB_JWT_TOKEN}` } })
                .then(res => res.json())
                .then(data => ({ deviceName: device.name, data: data }))
                .catch(e => {
                    console.error("Single device fetch error", e);
                    return null;
                });
        });

        const results = await Promise.all(fetchPromises);
        
        // Build Long-Format CSV Strategy
        let csvRows = [];
        // Header exactly mapping long-format dimensional properties plus the origin Device
        csvRows.push("DeviceName,Timestamp (DD/MM/YYYY HH:mm:ss),Timestamp_Millis,SensorComponent,Metric,Value");
        
        results.forEach(res => {
            if (!res || !res.data) return;
            
            Object.keys(res.data).forEach(sensorType => {
                const telemetryArray = res.data[sensorType];
                telemetryArray.forEach(pt => {
                    const tsMillis = pt.ts;
                    const tsIso = formatDDMMYYYY_HHMMSS(new Date(tsMillis));
                    let parsed = parseTBVal(pt.value);
                    if (typeof parsed === 'object') {
                        // Spread nested values (like BME688 inner metrics) natively across explicit row bindings
                        Object.keys(parsed).forEach(metric => {
                            let mValue = parsed[metric];
                            csvRows.push(`${res.deviceName},${tsIso},${tsMillis},${sensorType},${metric},${mValue}`);
                        });
                    } else {
                         csvRows.push(`${res.deviceName},${tsIso},${tsMillis},${sensorType},Raw,${parsed}`);
                    }
                });
            });
        });
            
        if (csvRows.length <= 1) {
            alert("No telemetry datasets located inside that timeframe for the selected devices.");
        } else {
            const csvString = csvRows.join('\n');
                const blob = new Blob([csvString], { type: 'text/csv' });
                const urlObj = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.hidden = true;
                a.href = urlObj;
                a.download = `Enviodev_Export_${formatDDMMYYYY(new Date(startTs)).replace(/\//g, '-')}_to_${formatDDMMYYYY(new Date(endTs)).replace(/\//g, '-')}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
    } catch (e) {
        console.error("Export generation broke: ", e);
        alert("Failed to reach platform endpoints.");
    } finally {
        btn.innerHTML = `<i class="fas fa-download"></i> Extract CSV`;
        btn.disabled = false;
        closeExportModal();
    }
}
