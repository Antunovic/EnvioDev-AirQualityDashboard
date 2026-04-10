const TB_HOST = 'eu.thingsboard.cloud';
let TB_JWT_TOKEN = '';
let charts = {};

document.addEventListener('DOMContentLoaded', () => {
    // Set default range (last 24h)
    const now = new Date();
    const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    
    document.getElementById('hist-start-date').value = yesterday.toISOString().split('T')[0];
    document.getElementById('hist-start-time').value = yesterday.toTimeString().slice(0, 5);
    document.getElementById('hist-end-date').value = now.toISOString().split('T')[0];
    document.getElementById('hist-end-time').value = now.toTimeString().slice(0, 5);

    // Initial connection
    startThingsBoardConnection();
});

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

    const grid = document.getElementById('hist-charts-grid');
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 3rem;"><i class="fas fa-spinner fa-spin fa-3x" style="color: #4facfe;"></i><p style="margin-top: 1rem;">Gathering timeseries data...</p></div>';

    const keys = 'BME688,GNSS,NEXTPM,SCD30,SENSORTECH,SGP41,SHT31';
    const limit = 5000;
    const url = `https://${TB_HOST}/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?keys=${keys}&startTs=${startTs}&endTs=${endTs}&limit=${limit}`;

    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${TB_JWT_TOKEN}` }
        });
        const data = await response.json();
        renderHistoricalCharts(data);
    } catch (e) {
        grid.innerHTML = '<p style="color: #ff1744;">Error fetching data. Check your connection.</p>';
        console.error(e);
    }
}

function renderHistoricalCharts(data) {
    const grid = document.getElementById('hist-charts-grid');
    grid.innerHTML = '';
    charts = {};

    let allMeasurements = {};

    // Flatten and group data
    Object.keys(data).forEach(key => {
        data[key].forEach(pt => {
            const val = parseTBVal(pt.value);
            const tsMatch = pt.ts;
            
            if (typeof val === 'object') {
                Object.keys(val).forEach(subKey => {
                    const label = `${key} - ${subKey}`;
                    if (!allMeasurements[label]) allMeasurements[label] = [];
                    allMeasurements[label].push({ x: tsMatch, y: val[subKey] });
                });
            } else {
                const label = `${key}`;
                if (!allMeasurements[label]) allMeasurements[label] = [];
                allMeasurements[label].push({ x: tsMatch, y: val });
            }
        });
    });

    // Create a chart for each unique measurement type
    Object.keys(allMeasurements).sort().forEach(label => {
        const container = document.createElement('div');
        container.className = 'chart-box';
        
        const canvas = document.createElement('canvas');
        container.appendChild(canvas);
        grid.appendChild(container);

        // Sort data by time
        const sortedData = allMeasurements[label].sort((a, b) => a.x - b.x);

        new Chart(canvas, {
            type: 'line',
            data: {
                datasets: [{
                    label: label,
                    data: sortedData,
                    borderColor: '#4facfe',
                    backgroundColor: 'rgba(79, 172, 254, 0.1)',
                    borderWidth: 2,
                    pointRadius: 1,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'linear',
                        ticks: {
                            callback: (val) => formatDDMMYYYY_HHMMSS(new Date(val)),
                            color: '#a0a0a0',
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 5
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#a0a0a0' }
                    }
                },
                plugins: {
                    legend: { labels: { color: 'white', font: { family: 'Outfit' } } }
                }
            }
        });
    });
}

function parseTBVal(val) {
    try {
        return typeof val === 'string' ? JSON.parse(val.replace(/[“”]/g, '"')) : val;
    } catch(e) { return val; }
}

function formatDDMMYYYY_HHMMSS(d) {
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
