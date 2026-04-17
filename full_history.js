const TB_HOST = 'eu.thingsboard.cloud';
let TB_JWT_TOKEN = '';
let map;
let markers = [];
let trajectoryPaths = [];

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

const ALL_DEVICES = [
    { id: "1043c890-3256-11f1-b641-ab83ce7b9a6f", name: "Enviodev device 1" },
    { id: "1df04d60-3256-11f1-a3ea-950631e217c8", name: "Enviodev device 2" },
    { id: "2b8f8bc0-3256-11f1-b641-ab83ce7b9a6f", name: "Enviodev device 3" },
    { id: "427b7740-3256-11f1-b641-ab83ce7b9a6f", name: "Enviodev device 4" },
    { id: "4bfaf430-3256-11f1-b641-ab83ce7b9a6f", name: "Enviodev device 5" }
];

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

    // Google Satellite Hybrid Tiles
    const satelliteUrl = 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
    const subdomains = ['mt0', 'mt1', 'mt2', 'mt3'];

    L.tileLayer(satelliteUrl, {
        maxZoom: 20,
        subdomains: subdomains
    }).addTo(map);

    window.addEventListener('themeChanged', (e) => {
        // Keep satellite view regardless of theme for consistency
    });
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

    let targets = [];
    if (deviceId === 'ALL') {
        targets = ALL_DEVICES;
    } else {
        targets = [ALL_DEVICES.find(d => d.id === deviceId)];
    }

    try {
        const fetchPromises = targets.map(device => {
            const url = `https://${TB_HOST}/api/plugins/telemetry/DEVICE/${device.id}/values/timeseries?keys=${keys}&startTs=${startTs}&endTs=${endTs}&limit=${limit}`;
            return fetch(url, { headers: { 'Authorization': `Bearer ${TB_JWT_TOKEN}` } })
                .then(res => res.json())
                .then(data => ({ deviceId: device.id, name: device.name, data: data }))
                .catch(e => null);
        });

        const results = await Promise.all(fetchPromises);
        processAndRender(results, deviceId === 'ALL');
    } catch (e) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 5rem; color: #ff1744;"><i class="fas fa-exclamation-triangle fa-3x"></i><p style="margin-top: 1rem;">Failed to retrieve historical data. Please try again.</p></div>';
        console.error(e);
    }
}

function processAndRender(results, isAllView) {
    const grid = document.getElementById('hist-charts-grid');
    grid.innerHTML = '';
    
    // Clear old visual markers and paths
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    trajectoryPaths.forEach(p => map.removeLayer(p));
    trajectoryPaths = [];

    const OSIJEK_CENTER = { lat: 45.5550, lon: 18.6761 };
    const MAX_DISTANCE_OS = 20000; // 20km

    let combinedMetrics = {
        'VOC Index': [], 'NOx Index': [], 'PM1': [], 'PM2.5': [],
        'PM10': [], 'Temperature': [], 'Humidity': [], 'CO2 Level': []
    };

    results.forEach(res => {
        if (!res || !res.data) return;
        const data = res.data;
        
        let gnssPoints = [];
        let metricsData = {
            'VOC Index': [], 'NOx Index': [], 'PM1': [], 'PM2.5': [],
            'PM10': [], 'Temperature': [], 'Humidity': [], 'CO2 Level': []
        };

        // 1. Process GNSS
        if (data.GNSS) {
            data.GNSS.sort((a,b) => a.ts - b.ts).forEach(pt => {
                let gnss = parseTBVal(pt.value);
                if (gnss.Latitude && gnss.Longitude) {
                    let lat = parseNMEA(gnss.Latitude, gnss.latDirection);
                    let lon = parseNMEA(gnss.Longitude, gnss.lonDirection);
                    if (lat && lon) {
                        let distFromCenter = getDistance(lat, lon, OSIJEK_CENTER.lat, OSIJEK_CENTER.lon);
                        if (distFromCenter <= MAX_DISTANCE_OS) {
                            gnssPoints.push({ lat, lon, ts: pt.ts });
                        }
                    }
                }
            });
        }

        // 2. Process Telemetry
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
        if (data.SCD30) {
            data.SCD30.forEach(pt => {
                let val = parseTBVal(pt.value);
                if (val.CO2 !== undefined) metricsData['CO2 Level'].push({ x: pt.ts, y: parseFloat(val.CO2) });
            });
        }

        // Sort metrics for this device
        Object.keys(metricsData).forEach(k => {
            metricsData[k].sort((a,b) => a.x - b.x);
            combinedMetrics[k] = combinedMetrics[k].concat(metricsData[k]);
        });

        // Add to Map
        renderDeviceOnMap(gnssPoints, metricsData, res.name);
    });

    if (isAllView) {
        grid.style.display = 'none'; // Hide charts as requested for "only map" view
    } else {
        grid.style.display = 'grid';
        Object.keys(combinedMetrics).forEach(label => {
            renderChart(label, combinedMetrics[label], grid);
        });
    }

    // Fit bounds of all paths
    if (trajectoryPaths.length > 0) {
        let featureGroup = L.featureGroup(trajectoryPaths);
        map.fitBounds(featureGroup.getBounds(), { padding: [50, 50] });
    }
}

function renderDeviceOnMap(gnssPoints, metrics, deviceName) {
    if (gnssPoints.length === 0) return;

    // Create Path
    let path = L.polyline(gnssPoints.map(p => [p.lat, p.lon]), {
        color: '#ff1744', weight: 4, opacity: 0.9, dashArray: '10, 10'
    }).addTo(map);
    trajectoryPaths.push(path);

    // Trackers
    let markerDataList = [];
    let cumulativePathDist = 0;

    // Start Marker
    let startMarker = L.marker([gnssPoints[0].lat, gnssPoints[0].lon], {
        icon: L.divIcon({
            html: `<i class="fas fa-play-circle" style="color: #00e676; font-size: 20px;"></i>`,
            className: 'custom-div-icon', iconSize: [20, 20], iconAnchor: [10, 10]
        })
    }).addTo(map).bindPopup(`${deviceName}: Start`);
    markers.push(startMarker);

    for (let i = 1; i < gnssPoints.length; i++) {
        let prev = gnssPoints[i - 1];
        let curr = gnssPoints[i];
        let stepDist = getDistance(prev.lat, prev.lon, curr.lat, curr.lon);
        cumulativePathDist += stepDist;

        if (cumulativePathDist >= 500) {
            let pmData = findClosestValue(curr.ts, metrics['PM2.5']);
            let pmValue = pmData ? pmData.y : 0;
            let aqi = calculateEAQI(pmValue);
            let bgColor = getEAQIColor(aqi);
            let textColor = (aqi > 20 && aqi <= 25) ? '#12141c' : 'white'; // Dark text for Yellow/Moderate

            const aqiIcon = L.divIcon({
                html: `<div style="background: ${bgColor}; color: ${textColor}; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px; border: 2px solid white; box-shadow: 0 4px 15px rgba(0,0,0,0.4);">${aqi}</div>`,
                className: 'aqi-marker', iconSize: [36, 36], iconAnchor: [18, 18]
            });

            // Spatial check (250m)
            let overlapIdx = markerDataList.findIndex(m => getDistance(curr.lat, curr.lon, m.lat, m.lon) < 250);

            let mObj = L.marker([curr.lat, curr.lon], { icon: aqiIcon }).addTo(map);
            mObj.bindPopup(`<b>${deviceName}</b><br>EAQI: ${aqi}<br>PM2.5: ${pmValue} µg/m³<br>Status: ${getEAQIStatus(aqi)}<br><small>Time: ${formatShortTime(new Date(curr.ts))}</small>`);

            if (overlapIdx !== -1) {
                map.removeLayer(markerDataList[overlapIdx].markerObj);
                let visualIdx = markers.indexOf(markerDataList[overlapIdx].markerObj);
                if (visualIdx > -1) markers.splice(visualIdx, 1);
                markerDataList[overlapIdx] = { markerObj: mObj, lat: curr.lat, lon: curr.lon };
            } else {
                markerDataList.push({ markerObj: mObj, lat: curr.lat, lon: curr.lon });
            }
            markers.push(mObj);
            cumulativePathDist -= 500;
        }
    }

    // End Marker
    const lastIdx = gnssPoints.length - 1;
    let endMarker = L.marker([gnssPoints[lastIdx].lat, gnssPoints[lastIdx].lon], {
        icon: L.divIcon({
            html: '<i class="fas fa-map-marker-alt" style="color: #ff1744; font-size: 24px;"></i>',
            className: 'custom-div-icon', iconSize: [24, 24], iconAnchor: [12, 24]
        })
    }).addTo(map).bindPopup(`${deviceName}: End`);
    markers.push(endMarker);
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

    dataPoints.sort((a,b) => a.x - b.x);

    new Chart(canvas, {
        type: 'line',
        data: {
            datasets: [{
                label: label,
                data: dataPoints,
                borderColor: config.color,
                backgroundColor: config.color + '1a',
                borderWidth: 3, pointRadius: 0, pointHoverRadius: 6, fill: true, tension: 0.4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            scales: {
                x: {
                    type: 'linear', grid: { display: false },
                    ticks: { callback: (val) => formatShortTime(new Date(val)), color: '#888', maxTicksLimit: 6 }
                },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } }
            },
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: 'rgba(18, 20, 28, 0.9)', titleFont: { family: 'Outfit'}, bodyFont: { family: 'Outfit'} }
            }
        }
    });
}

function parseTBVal(val) {
    try { return typeof val === 'string' ? JSON.parse(val.replace(/[“”]/g, '"')) : val; } catch(e) { return {}; }
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

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findClosestValue(ts, data) {
    if (!data || data.length === 0) return null;
    let closest = data[0];
    let minDiff = Math.abs(ts - closest.x);
    for (let i = 1; i < data.length; i++) {
        let diff = Math.abs(ts - data[i].x);
        if (diff < minDiff) { minDiff = diff; closest = data[i]; }
    }
    return closest;
}

// EAQI (European Air Quality Index) calculation for PM2.5
function calculateEAQI(pm25) {
    if (pm25 <= 10) return Math.round((20 / 10) * pm25); // Very Good (0-20)
    if (pm25 <= 20) return Math.round(((40 - 21) / (20 - 10.1)) * (pm25 - 10.1) + 21); // Good (21-40)
    if (pm25 <= 25) return Math.round(((60 - 41) / (25 - 20.1)) * (pm25 - 20.1) + 41); // Moderate (41-60)
    if (pm25 <= 50) return Math.round(((80 - 61) / (50 - 25.1)) * (pm25 - 25.1) + 61); // Poor (61-80)
    return 100; // Very Poor (81-100)
}

function getEAQIColor(aqi) {
    if (aqi <= 20) return '#00796b'; // Very Good (Dark Green)
    if (aqi <= 40) return '#00e676'; // Good (Green)
    if (aqi <= 60) return '#ffea00'; // Moderate (Yellow)
    if (aqi <= 80) return '#ff9100'; // Poor (Orange)
    return '#ff1744'; // Very Poor (Red)
}

function getEAQIStatus(aqi) {
    if (aqi <= 20) return 'Very Good';
    if (aqi <= 40) return 'Good';
    if (aqi <= 60) return 'Moderate';
    if (aqi <= 80) return 'Poor';
    return 'Very Poor';
}

function formatShortTime(d) {
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
