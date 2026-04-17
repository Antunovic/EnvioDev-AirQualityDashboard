const TB_HOST = 'eu.thingsboard.cloud';
let TB_JWT_TOKEN = '';
let map;
let trajectoryPath;
let markers = [];

const METRICS_CONFIG = {
    'VOC Index': { icon: 'fa-flask', color: '#00e676', key: 'voc' },
    'NOx Index': { icon: 'fa-industry', color: '#ff1744', key: 'nox' },
    'PM1': { icon: 'fa-smog', color: '#4facfe', key: 'pm1' },
    'PM2.5': { icon: 'fa-smog', color: '#00f2fe', key: 'pm25' },
    'PM10': { icon: 'fa-smog', color: '#4481eb', key: 'pm10' },
    'Temperature': { icon: 'fa-temperature-half', color: '#ffea00', key: 'temp' },
    'Humidity': { icon: 'fa-droplet', color: '#00c6ff', key: 'hum' },
    'CO2 Level': { icon: 'fa-wind', color: '#c864ff', key: 'co2' }
};

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    
    // Set default range (last 24h)
    const now = new Date();
    const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    
    document.getElementById('hist-start-date').value = yesterday.toISOString().split('T')[0];
    document.getElementById('hist-start-time').value = yesterday.toTimeString().slice(0, 5);
    document.getElementById('hist-end-date').value = now.toISOString().split('T')[0];
    document.getElementById('hist-end-time').value = now.toTimeString().slice(0, 5);

    startThingsBoardConnection();
});

function initMap() {
    map = L.map('map', {
        zoomControl: true,
        attributionControl: false
    }).setView([45.5550, 18.6761], 13);

    const isLight = document.body.classList.contains('light-theme');
    const tileUrl = isLight 
        ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);

    window.addEventListener('themeChanged', (e) => {
        const isLight = e.detail.theme === 'light';
        const newTileUrl = isLight 
            ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        
        map.eachLayer((layer) => {
            if (layer instanceof L.TileLayer) {
                map.removeLayer(layer);
            }
        });
        
        L.tileLayer(newTileUrl, { maxZoom: 19 }).addTo(map);
    });
    
    trajectoryPath = L.polyline([], {
        color: '#4facfe',
        weight: 4,
        opacity: 0.8,
        dashArray: '10, 10',
        lineJoin: 'round'
    }).addTo(map);
}

async function startThingsBoardConnection() {
    let enteredPassword = "";
    if (typeof TB_PASSWORD_SECRET !== 'undefined') {
        enteredPassword = TB_PASSWORD_SECRET;
    } else {
        enteredPassword = prompt("Authentication Required: Please enter your ThingsBoard Access Password:");
    }

    if (!enteredPassword) return;

    const credentials = {
        "username": "antonio.antunovic@ferit.hr",
        "password": enteredPassword 
    };

    try {
        const response = await fetch(`https://${TB_HOST}/api/auth/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
            body: JSON.stringify(credentials)
        });

        if (response.ok) {
            const data = await response.json();
            TB_JWT_TOKEN = data.token;
            console.log("Authenticated successfully for Historical View");
        }
    } catch (e) { console.error(e); }
}

async function fetchHistoricalData() {
    if (!TB_JWT_TOKEN) {
        alert("Connecting to ThingsBoard... please wait.");
        return;
    }

    const deviceId = document.getElementById('hist-device-select').value;
    const startStr = `${document.getElementById('hist-start-date').value}T${document.getElementById('hist-start-time').value}`;
    const endStr = `${document.getElementById('hist-end-date').value}T${document.getElementById('hist-end-time').value}`;
    
    const startTs = new Date(startStr).getTime();
    const endTs = new Date(endStr).getTime();

    if (isNaN(startTs) || isNaN(endTs)) {
        alert("Please select valid start and end dates/times.");
        return;
    }

    const grid = document.getElementById('hist-charts-grid');
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 5rem;"><i class="fas fa-spinner fa-spin fa-3x" style="color: #4facfe;"></i><p style="margin-top: 1.5rem; font-weight: 600;">Reconstructing historical data timeline...</p></div>';

    // Fetch all relevant sensors for the 8 metrics + location
    const keys = 'BME688,GNSS,NEXTPM,SCD30,SGP41,SHT31';
    const limit = 10000;
    const url = `https://${TB_HOST}/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?keys=${keys}&startTs=${startTs}&endTs=${endTs}&limit=${limit}`;

    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${TB_JWT_TOKEN}` }
        });
        const data = await response.json();
        processAndRender(data);
    } catch (e) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 5rem; color: #ff1744;"><i class="fas fa-exclamation-triangle fa-3x"></i><p style="margin-top: 1rem;">Failed to retrieve historical data. Please try again.</p></div>';
        console.error(e);
    }
}

function processAndRender(data) {
    const grid = document.getElementById('hist-charts-grid');
    grid.innerHTML = '';
    
    let metricsData = {
        'VOC Index': [],
        'NOx Index': [],
        'PM1': [],
        'PM2.5': [],
        'PM10': [],
        'Temperature': [],
        'Humidity': [],
        'CO2 Level': []
    };
    
    let pathCoords = [];

    // 1. Process GNSS for Trajectory
    if (data.GNSS) {
        data.GNSS.sort((a,b) => a.ts - b.ts).forEach(pt => {
            let gnss = parseTBVal(pt.value);
            if (gnss.Latitude && gnss.Longitude) {
                let lat = parseNMEA(gnss.Latitude, gnss.latDirection);
                let lon = parseNMEA(gnss.Longitude, gnss.lonDirection);
                if (lat && lon) pathCoords.push([lat, lon]);
            }
        });
    }

    // 2. Process Telemetry for 8 Metrics
    // SGP41 -> VOC, NOx
    if (data.SGP41) {
        data.SGP41.forEach(pt => {
            let val = parseTBVal(pt.value);
            if (val.VOC_Index !== undefined) metricsData['VOC Index'].push({ x: pt.ts, y: parseInt(val.VOC_Index) });
            if (val.NOx_Index !== undefined) metricsData['NOx Index'].push({ x: pt.ts, y: parseInt(val.NOx_Index) });
        });
    }

    // NEXTPM -> PM1, PM2.5, PM10
    if (data.NEXTPM) {
        data.NEXTPM.forEach(pt => {
            let val = parseTBVal(pt.value);
            if (val["PM1(ug/m3)"] !== undefined) metricsData['PM1'].push({ x: pt.ts, y: parseFloat(val["PM1(ug/m3)"]) });
            if (val["PM2_5(ug/m3)"] !== undefined) metricsData['PM2.5'].push({ x: pt.ts, y: parseFloat(val["PM2_5(ug/m3)"]) });
            if (val["PM10(ug/m3)"] !== undefined) metricsData['PM10'].push({ x: pt.ts, y: parseFloat(val["PM10(ug/m3)"]) });
        });
    }

    // SHT31 -> Temp, Hum (Primary)
    if (data.SHT31) {
        data.SHT31.forEach(pt => {
            let val = parseTBVal(pt.value);
            if (val.temperature !== undefined) metricsData['Temperature'].push({ x: pt.ts, y: parseFloat(val.temperature) });
            if (val.humidity !== undefined) metricsData['Humidity'].push({ x: pt.ts, y: parseFloat(val.humidity) });
        });
    }

    // BME688 -> Temp, Hum (Fallback if needed, though we just append for now)
    if (data.BME688) {
        data.BME688.forEach(pt => {
            let val = parseTBVal(pt.value);
            // Only add if we don't have too many points from SHT31 or just merge
            if (metricsData['Temperature'].length < 10) { // arbitrary small check
                 if (val.temperature !== undefined) metricsData['Temperature'].push({ x: pt.ts, y: parseFloat(val.temperature) });
                 if (val.humidity !== undefined) metricsData['Humidity'].push({ x: pt.ts, y: parseFloat(val.humidity) });
            }
        });
    }

    // SCD30 -> CO2
    if (data.SCD30) {
        data.SCD30.forEach(pt => {
            let val = parseTBVal(pt.value);
            if (val.CO2 !== undefined) metricsData['CO2 Level'].push({ x: pt.ts, y: parseFloat(val.CO2) });
        });
    }

    // Update Map
    updateTrajectory(pathCoords);

    // Render Charts
    Object.keys(metricsData).forEach(label => {
        renderChart(label, metricsData[label], grid);
    });
}

function updateTrajectory(coords) {
    if (trajectoryPath) trajectoryPath.setLatLngs(coords);
    
    // Clear old markers
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    if (coords.length > 0) {
        // Start marker
        const startIcon = L.divIcon({
            html: '<i class="fas fa-play-circle" style="color: #00e676; font-size: 20px;"></i>',
            className: 'custom-div-icon',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
        const startMarker = L.marker(coords[0], { icon: startIcon }).addTo(map).bindPopup("Journey Start");
        
        // End marker
        const endIcon = L.divIcon({
            html: '<i class="fas fa-map-marker-alt" style="color: #ff1744; font-size: 24px;"></i>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24]
        });
        const endMarker = L.marker(coords[coords.length - 1], { icon: endIcon }).addTo(map).bindPopup("Journey End");
        
        markers.push(startMarker, endMarker);
        
        map.fitBounds(trajectoryPath.getBounds(), { padding: [50, 50] });
    }
}

function renderChart(label, dataPoints, container) {
    const config = METRICS_CONFIG[label];
    const box = document.createElement('div');
    box.className = 'chart-box';
    
    const title = document.createElement('div');
    title.className = 'chart-title';
    title.innerHTML = `<i class="fas ${config.icon}" style="color: ${config.color};"></i> ${label}`;
    
    const canvas = document.createElement('canvas');
    box.appendChild(title);
    box.appendChild(canvas);
    container.appendChild(box);

    if (dataPoints.length === 0) {
        const noData = document.createElement('div');
        noData.style.textAlign = 'center';
        noData.style.paddingTop = '4rem';
        noData.style.color = '#666';
        noData.innerHTML = '<i class="fas fa-ghost fa-2x"></i><p>No data recorded</p>';
        box.appendChild(noData);
        canvas.style.display = 'none';
        return;
    }

    // Sort by timestamp
    dataPoints.sort((a,b) => a.x - b.x);

    new Chart(canvas, {
        type: 'line',
        data: {
            datasets: [{
                label: label,
                data: dataPoints,
                borderColor: config.color,
                backgroundColor: config.color + '1a', // 10% opacity
                borderWidth: 3,
                pointRadius: 0,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            scales: {
                x: {
                    type: 'linear',
                    grid: { display: false },
                    ticks: {
                        callback: (val) => formatShortTime(new Date(val)),
                        color: '#888',
                        maxTicksLimit: 6
                    }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#888' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(18, 20, 28, 0.9)',
                    titleFont: { family: 'Outfit', size: 14 },
                    bodyFont: { family: 'Outfit', size: 13 },
                    callbacks: {
                        title: (items) => formatFullDate(new Date(items[0].parsed.x))
                    }
                }
            }
        }
    });
}

// Helpers
function parseTBVal(val) {
    try {
        return typeof val === 'string' ? JSON.parse(val.replace(/[“”]/g, '"')) : val;
    } catch(e) { return {}; }
}

function parseNMEA(coordStr, direction) {
    if (!coordStr || coordStr === "") return null;
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

function formatShortTime(d) {
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatFullDate(d) {
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}
