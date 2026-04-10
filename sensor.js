const urlParams = new URLSearchParams(window.location.search);
const targetSensor = urlParams.get('sensor') || 'SHT31';

document.getElementById('page-title').innerHTML = `<i class="fas fa-satellite-dish" style="color: #4facfe;"></i> ${targetSensor} Metrics Dashboard`;

const TB_HOST = 'eu.thingsboard.cloud';
// Dynamically retrieve device ID from localStorage with fallback
const TB_DEVICE_ID = localStorage.getItem('TB_DEVICE_ID') || '1043c890-3256-11f1-b641-ab83ce7b9a6f';
let TB_JWT_TOKEN = '';
let tbPollingInterval;

const MAX_CHART_POINTS = 30;
let charts = {}; // metric_name -> chart instance
let histories = {}; // metric_name -> { timestamps: [], values: [] }
let lastTs = null;
let isFirstFetch = true;

document.addEventListener('DOMContentLoaded', () => {
    startThingsBoardConnection();
});

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

async function startThingsBoardConnection() {
    const credentials = {
        "username": "antonio.antunovic@ferit.hr",
        "password": "fibonacci112358" 
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
            await fetchThingsBoardData();
            tbPollingInterval = setInterval(fetchThingsBoardData, 5000);
        }
    } catch (error) {
        console.error('Network Error:', error);
    }
}

async function fetchThingsBoardData() {
    if (!TB_JWT_TOKEN) return;

    const limit = isFirstFetch ? MAX_CHART_POINTS : 1;
    const endTs = Date.now();
    const startTs = endTs - (10 * 60 * 1000);
    
    const url = `https://${TB_HOST}/api/plugins/telemetry/DEVICE/${TB_DEVICE_ID}/values/timeseries?keys=${targetSensor}&startTs=${startTs}&endTs=${endTs}&limit=${limit}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TB_JWT_TOKEN}` }
        });

        if (response.ok) {
            const data = await response.json();
            
            if (data[targetSensor] && data[targetSensor].length > 0) {
                if(isFirstFetch) {
                    const items = data[targetSensor].reverse();
                    
                    let sampleVal = items[0].value;
                    let parsed = typeof sampleVal === 'string' ? JSON.parse(sampleVal.replace(/[“”]/g, '"')) : sampleVal;
                    
                    initializeCharts(Object.keys(parsed));

                    items.forEach(item => {
                        let val = item.value;
                        let obj = typeof val === 'string' ? JSON.parse(val.replace(/[“”]/g, '"')) : val;
                        const timeStr = formatDDMMYYYY_HHMMSS(new Date(item.ts));
                        pushToCharts(timeStr, obj);
                    });
                    lastTs = items[items.length - 1].ts;
                    isFirstFetch = false;
                } else {
                    const latestTs = data[targetSensor][0].ts;
                    if (latestTs !== lastTs) {
                        lastTs = latestTs;
                        let val = data[targetSensor][0].value;
                        let obj = typeof val === 'string' ? JSON.parse(val.replace(/[“”]/g, '"')) : val;
                        const timeStr = formatDDMMYYYY_HHMMSS(new Date(latestTs));
                        pushToCharts(timeStr, obj);
                    }
                }
            } else if (isFirstFetch) {
                document.getElementById('charts-grid').innerHTML = `<p style="grid-column: 1 / -1; text-align: center; color: #ff1744;">No recent data found for exact sensor keys: ${targetSensor}. Is the device active?</p>`;
            }
        }
    } catch (e) { console.error('Fetch Error:', e); }
}

function initializeCharts(metricsKeys) {
    const grid = document.getElementById('charts-grid');
    grid.innerHTML = '';
    
    // Some nice gradient colors arrays for visual distinction
    const colors = ['#4facfe', '#00f2fe', '#00e676', '#ffea00', '#ff9100', '#c864ff', '#ff1744', '#f06292'];

    metricsKeys.forEach((metric, index) => {
        const color = colors[index % colors.length];

        const div = document.createElement('div');
        div.className = 'chart-box';
        div.innerHTML = `<h3 style="margin-bottom: 15px; font-size: 1.1rem; color: ${color};"><i class="fas fa-chart-pie"></i> ${metric}</h3>
                         <div style="position: relative; height: 280px; width: 100%;">
                             <canvas id="chart-${metric}"></canvas>
                         </div>`;
        grid.appendChild(div);

        histories[metric] = { timestamps: [], values: [] };
        
        const ctx = document.getElementById(`chart-${metric}`);
        charts[metric] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: metric,
                    data: [],
                    borderColor: color,
                    backgroundColor:  `rgba(${hexToRgb(color)}, 0.1)`,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2,
                    pointBackgroundColor: color,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: '#a0a0a0', maxTicksLimit: 7 }, grid: { display: false } },
                    y: { ticks: { color: color }, grid: { color: 'rgba(255,255,255,0.04)' } }
                },
                plugins: { legend: { display: false } }
            }
        });
    });
}

function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '255,255,255';
}

function pushToCharts(timeStr, metricsObj) {
    Object.keys(metricsObj).forEach(metric => {
        if (!histories[metric]) return; // Skip if unrecognized JSON structure addition occurs
        
        let value = metricsObj[metric];
        
        histories[metric].timestamps.push(timeStr);
        histories[metric].values.push(parseFloat(value) || 0);

        if (histories[metric].timestamps.length > MAX_CHART_POINTS) {
            histories[metric].timestamps.shift();
            histories[metric].values.shift();
        }

        if (charts[metric]) {
            charts[metric].data.labels = histories[metric].timestamps;
            charts[metric].data.datasets[0].data = histories[metric].values;
            charts[metric].update('none');
        }
    });
}
