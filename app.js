const API_URL = 'http://localhost:8000/api/data';
let sensors = [];
let currentSensorId = 'sensor_1';
let map, marker;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    fetchData();
    setInterval(fetchData, 3000); // Update every 3 seconds
});

function initMap() {
    // Initialize map centered on the general location
    map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView([45.5550, 18.6761], 13);

    // Dark theme for Leaflet
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
    }).addTo(map);

    marker = L.marker([45.5550, 18.6761]).addTo(map);
}

async function fetchData() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        sensors = data;

        renderSidebar();
        updateDashboard();

        document.getElementById('online-status').style.opacity = '1';
    } catch (error) {
        console.error('Error fetching data:', error);
        document.getElementById('online-status').style.opacity = '0.3';
    }
}

function renderSidebar() {
    const nav = document.getElementById('sensor-nav');
    nav.innerHTML = '';

    sensors.forEach(sensor => {
        const li = document.createElement('li');
        li.className = sensor.id === currentSensorId ? 'active' : '';
        li.innerHTML = `
            <div style="font-weight: 600">${sensor.name}</div>
            <div style="font-size: 0.75rem; color: #a0a0a0">AQI: ${sensor.aqi || '--'}</div>
        `;
        li.addEventListener('click', () => {
            currentSensorId = sensor.id;
            updateDashboard();
            renderSidebar();
        });
        nav.appendChild(li);
    });
}

function updateDashboard() {
    const sensor = sensors.find(s => s.id === currentSensorId);
    if (!sensor) return;

    // Update Header
    document.getElementById('current-sensor-name').innerText = sensor.name;
    document.getElementById('last-update').innerText = sensor.last_update;

    // Update Stats
    document.getElementById('val-aqi').innerText = sensor.aqi;
    document.getElementById('val-pm').innerHTML = `${sensor.pm25} <span class="unit">µg/m³</span>`;
    document.getElementById('val-temp').innerHTML = `${sensor.temp} <span class="unit">°C</span>`;
    document.getElementById('val-hum').innerHTML = `${sensor.hum} <span class="unit">%</span>`;

    // AQI Logic (Color and Label)
    const aqiBar = document.getElementById('progress-aqi');
    const aqiLabel = document.getElementById('label-aqi');
    const aqiPercent = Math.min(100, (sensor.aqi / 300) * 100);

    aqiBar.style.width = `${aqiPercent}%`;

    if (sensor.aqi <= 50) {
        aqiBar.style.background = '#00e676';
        aqiLabel.innerText = 'Good';
        aqiLabel.style.color = '#00e676';
    } else if (sensor.aqi <= 100) {
        aqiBar.style.background = '#ffea00';
        aqiLabel.innerText = 'Moderate';
        aqiLabel.style.color = '#ffea00';
    } else if (sensor.aqi <= 150) {
        aqiBar.style.background = '#ff9100';
        aqiLabel.innerText = 'Unhealthy';
        aqiLabel.style.color = '#ff9100';
    } else {
        aqiBar.style.background = '#ff1744';
        aqiLabel.innerText = 'Hazardous';
        aqiLabel.style.color = '#ff1744';
    }

    // Update Map
    const newPos = [sensor.lat, sensor.lng];
    marker.setLatLng(newPos);
    map.panTo(newPos);
}

function viewHistory(type) {
    // Open historical trend page for current sensor and specific metric
    window.location.href = `history.html?sensor=${currentSensorId}&type=${type}`;
}
