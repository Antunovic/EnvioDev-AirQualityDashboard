let trendChart;
const urlParams = new URLSearchParams(window.location.search);
const metricType = urlParams.get('type') || 'pm25';

const TB_HOST = 'eu.thingsboard.cloud';
// Dynamically retrieve device ID from localStorage with fallback
const TB_DEVICE_ID = localStorage.getItem('TB_DEVICE_ID') || '1043c890-3256-11f1-b641-ab83ce7b9a6f';
let TB_JWT_TOKEN = '';
let tbPollingInterval;

const MAX_CHART_POINTS = 50;
const historyData = { timestamps: [], values: [] };
let lastTs = null;
let isFirstFetch = true;

// Map simple types from index.html clicks to actual ThingsBoard Telemetry keys and JSON structural fields
const queryMapping = {
    'pm1': { key: 'NEXTPM', field: 'PM1(ug/m3)', title: 'PM1 Content Trend', color: '#ff9100' },
    'pm25': { key: 'NEXTPM', field: 'PM2_5(ug/m3)', title: 'PM2.5 Measurement Trend', color: '#ff9100' },
    'pm10': { key: 'NEXTPM', field: 'PM10(ug/m3)', title: 'PM10 Content Trend', color: '#ff9100' },
    'voc': { key: 'SGP41', field: 'VOC_Index', title: 'VOC Index Trend', color: '#00e676' },
    'nox': { key: 'SGP41', field: 'NOx_Index', title: 'NOx Index Trend', color: '#ff1744' },
    'temp': { key: 'SHT31', field: 'temperature', title: 'Temperature Trend', color: '#4facfe' },
    'hum': { key: 'SHT31', field: 'humidity', title: 'Humidity Trend', color: '#00f2fe' },
    'co2': { key: 'SCD30', field: 'CO2', title: 'CO2 Level Trend', color: '#c864ff' }
};

const mapConfig = queryMapping[metricType];

document.addEventListener('DOMContentLoaded', () => {
    if (!mapConfig) {
        window.location.href = 'index.html';
        return;
    }
    
    document.getElementById('history-title').innerText = mapConfig.title;
    document.getElementById('history-subtitle').innerText = `Real-time updates`;

    startThingsBoardConnection();
});

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
            await fetchHistoryData();
            tbPollingInterval = setInterval(fetchHistoryData, 5000);
        }
    } catch (error) {
        console.error('Network Error:', error);
    }
}

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

function parseTBVal(val) {
    try {
        return typeof val === 'string' ? JSON.parse(val.replace(/[“”]/g, '"')) : val;
    } catch(e) {
        return {};
    }
}

async function fetchHistoryData() {
    if (!TB_JWT_TOKEN) return;

    const limit = isFirstFetch ? MAX_CHART_POINTS : 1;
    const endTs = Date.now();
    const startTs = endTs - (30 * 60 * 1000); // last 30 mins
    
    const url = `https://${TB_HOST}/api/plugins/telemetry/DEVICE/${TB_DEVICE_ID}/values/timeseries?keys=${mapConfig.key}&startTs=${startTs}&endTs=${endTs}&limit=${limit}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TB_JWT_TOKEN}` }
        });

        if (response.ok) {
            const data = await response.json();
            const series = data[mapConfig.key];
            if (series && series.length > 0) {
                if (isFirstFetch) {
                    const items = series.reverse();
                    items.forEach(item => {
                        let obj = parseTBVal(item.value);
                        if (obj[mapConfig.field] !== undefined) {
                            historyData.timestamps.push(formatDDMMYYYY_HHMMSS(new Date(item.ts)));
                            historyData.values.push(parseFloat(obj[mapConfig.field]));
                        }
                    });
                    if (items.length > 0) lastTs = items[items.length - 1].ts;
                    isFirstFetch = false;
                    renderChart();
                } else {
                    const latestTs = series[0].ts;
                    if (latestTs !== lastTs) {
                        lastTs = latestTs;
                        let obj = parseTBVal(series[0].value);
                        if (obj[mapConfig.field] !== undefined) {
                            historyData.timestamps.push(formatDDMMYYYY_HHMMSS(new Date(latestTs)));
                            historyData.values.push(parseFloat(obj[mapConfig.field]));
                            if (historyData.timestamps.length > MAX_CHART_POINTS) {
                                historyData.timestamps.shift();
                                historyData.values.shift();
                            }
                            renderChart();
                        }
                    }
                }
            } else if (isFirstFetch) {
                // Failsafe rendering if no data exists
                console.warn("No data returned for historical timeline.");
            }
        }
    } catch (e) { console.error('Fetch Error:', e); }
}

function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '255,255,255';
}

function renderChart() {
    const ctx = document.getElementById('trendChart').getContext('2d');
    const accentColor = mapConfig.color;

    if (trendChart) {
        trendChart.data.labels = historyData.timestamps;
        trendChart.data.datasets[0].data = historyData.values;
        trendChart.update('none'); 
    } else {
        trendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: historyData.timestamps,
                datasets: [{
                    label: mapConfig.field,
                    data: historyData.values,
                    borderColor: accentColor,
                    backgroundColor: `rgba(${hexToRgb(accentColor)}, 0.1)`,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: accentColor
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: accentColor, font: { size: 14 } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#a0a0a0', maxTicksLimit: 12 }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.7)'
                    }
                }
            }
        });
    }
}
