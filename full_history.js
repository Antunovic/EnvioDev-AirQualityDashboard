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
    
    let gnssPoints = [];

    // 1. Process GNSS
    if (data.GNSS) {
        data.GNSS.sort((a,b) => a.ts - b.ts).forEach(pt => {
            let gnss = parseTBVal(pt.value);
            if (gnss.Latitude && gnss.Longitude) {
                let lat = parseNMEA(gnss.Latitude, gnss.latDirection);
                let lon = parseNMEA(gnss.Longitude, gnss.lonDirection);
                if (lat && lon) gnssPoints.push({ lat, lon, ts: pt.ts });
            }
        });
    }

    // 2. Process Telemetry for 8 Metrics
    if (data.SGP41) {
        data.SGP41.forEach(pt => {
            let val = parseTBVal(pt.value);
            if (val.VOC_Index !== undefined) metricsData['VOC Index'].push({ x: pt.ts, y: parseInt(val.VOC_Index) });
            if (val.NOx_Index !== undefined) metricsData['NOx Index'].push({ x: pt.ts, y: parseInt(val.NOx_Index) });
        });
    }

    if (data.NEXTPM) {
        data.NEXTPM.forEach(pt => {
            let val = parseTBVal(pt.value);
            if (val["PM1(ug/m3)"] !== undefined) metricsData['PM1'].push({ x: pt.ts, y: parseFloat(val["PM1(ug/m3)"]) });
            if (val["PM2_5(ug/m3)"] !== undefined) metricsData['PM2.5'].push({ x: pt.ts, y: parseFloat(val["PM2_5(ug/m3)"]) });
            if (val["PM10(ug/m3)"] !== undefined) metricsData['PM10'].push({ x: pt.ts, y: parseFloat(val["PM10(ug/m3)"]) });
        });
    }

    if (data.SHT31) {
        data.SHT31.forEach(pt => {
            let val = parseTBVal(pt.value);
            if (val.temperature !== undefined) metricsData['Temperature'].push({ x: pt.ts, y: parseFloat(val.temperature) });
            if (val.humidity !== undefined) metricsData['Humidity'].push({ x: pt.ts, y: parseFloat(val.humidity) });
        });
    }

    if (data.BME688) {
        data.BME688.forEach(pt => {
            let val = parseTBVal(pt.value);
            if (metricsData['Temperature'].length < 10) {
                 if (val.temperature !== undefined) metricsData['Temperature'].push({ x: pt.ts, y: parseFloat(val.temperature) });
                 if (val.humidity !== undefined) metricsData['Humidity'].push({ x: pt.ts, y: parseFloat(val.humidity) });
            }
        });
    }

    if (data.SCD30) {
        data.SCD30.forEach(pt => {
            let val = parseTBVal(pt.value);
            if (val.CO2 !== undefined) metricsData['CO2 Level'].push({ x: pt.ts, y: parseFloat(val.CO2) });
        });
    }

    // Sort all metrics for faster lookup
    Object.keys(metricsData).forEach(k => metricsData[k].sort((a,b) => a.x - b.x));

    // Update Map with path and AQI markers
    updateTrajectoryWithAQI(gnssPoints, metricsData);

    // Render Charts
    Object.keys(metricsData).forEach(label => {
        renderChart(label, metricsData[label], grid);
    });
}

function updateTrajectoryWithAQI(gnssPoints, metrics) {
    const coords = gnssPoints.map(p => [p.lat, p.lon]);
    if (trajectoryPath) trajectoryPath.setLatLngs(coords);
    
    // Clear old visual markers
    // We'll maintain an internal list of objects to track location/ts for replacement logic
    let markerList = []; 

    // Helper to clear existing markers from the map before re-rendering
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    if (gnssPoints.length === 0) return;

    // Start Marker
    markers.push(L.marker([gnssPoints[0].lat, gnssPoints[0].lon], {
        icon: L.divIcon({
            html: '<i class="fas fa-play-circle" style="color: #00e676; font-size: 20px;"></i>',
            className: 'custom-div-icon', iconSize: [20, 20], iconAnchor: [10, 10]
        })
    }).addTo(map).bindPopup("Journey Start"));

    let lastMarkerPoint = gnssPoints[0];
    let totalTraveled = 0;

    for (let i = 1; i < gnssPoints.length; i++) {
        let currentPoint = gnssPoints[i];
        let distFromLastMarker = getDistance(lastMarkerPoint.lat, lastMarkerPoint.lon, currentPoint.lat, currentPoint.lon);
        totalTraveled += getDistance(gnssPoints[i-1].lat, gnssPoints[i-1].lon, currentPoint.lat, currentPoint.lon);

        if (distFromLastMarker >= 500) {
            let pmData = findClosestValue(currentPoint.ts, metrics['PM2.5']);
            let pmValue = pmData ? pmData.y : 0;
            let aqi = calculateSimplifiedAQI(pmValue);
            let bgColor = getAQIColor(aqi);
            let textColor = (aqi > 50 && aqi <= 100) ? '#12141c' : 'white';

            const aqiIcon = L.divIcon({
                html: `<div style="background: ${bgColor}; color: ${textColor}; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px; border: 2px solid rgba(255,255,255,0.7); box-shadow: 0 4px 15px rgba(0,0,0,0.4); text-align: center; line-height: 1;">${aqi}</div>`,
                className: 'aqi-marker',
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });

            // Check if we are too close (e.g., < 200m) to ANY already placed marker (for overlapping paths)
            // If we are, we replace the older one in that slot
            let existingIdx = markerList.findIndex(m => getDistance(currentPoint.lat, currentPoint.lon, m.lat, m.lon) < 200);

            let mObj = L.marker([currentPoint.lat, currentPoint.lon], { icon: aqiIcon }).addTo(map);
            mObj.bindPopup(`<b>Air Quality Detail</b><br>AQI: ${aqi}<br>PM2.5: ${pmValue} µg/m³<br>Status: ${getAQIStatus(aqi)}<br><small>Updated: ${formatShortTime(new Date(currentPoint.ts))}</small>`);
            
            if (existingIdx !== -1) {
                // Remove old marker from map
                map.removeLayer(markerList[existingIdx].markerObj);
                // Also remove it from our visual 'markers' tracker used for cleanup
                let globalIdx = markers.indexOf(markerList[existingIdx].markerObj);
                if (globalIdx > -1) markers.splice(globalIdx, 1);
                
                // Replace in markerList
                markerList[existingIdx] = { markerObj: mObj, lat: currentPoint.lat, lon: currentPoint.lon };
            } else {
                markerList.push({ markerObj: mObj, lat: currentPoint.lat, lon: currentPoint.lon });
            }

            markers.push(mObj);
            lastMarkerPoint = currentPoint;
        }
    }

    // End Marker
    const lastIdx = gnssPoints.length - 1;
    markers.push(L.marker([gnssPoints[lastIdx].lat, gnssPoints[lastIdx].lon], {
        icon: L.divIcon({
            html: '<i class="fas fa-map-marker-alt" style="color: #ff1744; font-size: 24px;"></i>',
            className: 'custom-div-icon', iconSize: [24, 24], iconAnchor: [12, 24]
        })
    }).addTo(map).bindPopup(`Journey End<br>Total Trajectory: ${Math.round(totalTraveled)}m`));

    // Wait for markers to be added before fitting bounds
    setTimeout(() => {
        if (trajectoryPath && trajectoryPath.getLatLngs().length > 0) {
            map.fitBounds(trajectoryPath.getBounds(), { padding: [50, 50] });
        }
    }, 100);
}

function findClosestValue(ts, data) {
    if (!data || data.length === 0) return null;
    let closest = data[0];
    let minDiff = Math.abs(ts - closest.x);
    for (let i = 1; i < data.length; i++) {
        let diff = Math.abs(ts - data[i].x);
        if (diff < minDiff) {
            minDiff = diff;
            closest = data[i];
        }
    }
    return closest;
}

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Radius of Earth in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function calculateSimplifiedAQI(pm25) {
    if (pm25 <= 12) return Math.round((50 / 12) * pm25);
    if (pm25 <= 35.4) return Math.round(((100 - 51) / (35.4 - 12.1)) * (pm25 - 12.1) + 51);
    if (pm25 <= 55.4) return Math.round(((150 - 101) / (55.4 - 35.5)) * (pm25 - 35.5) + 101);
    if (pm25 <= 150.4) return Math.round(((200 - 151) / (150.4 - 55.5)) * (pm25 - 55.5) + 151);
    return 250;
}

function getAQIColor(aqi) {
    if (aqi <= 50) return '#00e676';
    if (aqi <= 100) return '#ffea00';
    if (aqi <= 150) return '#ff9100';
    if (aqi <= 200) return '#ff1744';
    return '#8f3f97';
}

function getAQIStatus(aqi) {
    if (aqi <= 50) return 'Good';
    if (aqi <= 100) return 'Moderate';
    if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
    if (aqi <= 200) return 'Unhealthy';
    return 'Very Unhealthy';
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
