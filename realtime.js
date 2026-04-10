// ThingsBoard Konfiguracija 
const TB_HOST = 'eu.thingsboard.cloud';
const TB_DEVICE_ID = '1043c890-3256-11f1-b641-ab83ce7b9a6f';
let TB_JWT_TOKEN = '';
let tbPollingInterval;
let lastTs = null;
let isFirstFetch = true;

// SHT31 Live Chart Data
const MAX_CHART_POINTS = 50;
const sht31History = { timestamps: [], temperature: [], humidity: [] };
let sht31Chart = null;

document.addEventListener('DOMContentLoaded', () => {
    initSHT31Chart();
});

function initSHT31Chart() {
    const ctx = document.getElementById('sht31Chart');
    if (!ctx) return;

    sht31Chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Temperature (°C)',
                    data: [],
                    borderColor: '#4facfe',
                    backgroundColor: 'rgba(79, 172, 254, 0.15)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#4facfe',
                    yAxisID: 'y'
                },
                {
                    label: 'Humidity (%)',
                    data: [],
                    borderColor: '#00f2fe',
                    backgroundColor: 'rgba(0, 242, 254, 0.10)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#00f2fe',
                    yAxisID: 'y1'
                }
            ]
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
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'Temperature (°C)', color: '#4facfe', font: { size: 14 } },
                    grid: { color: 'rgba(255, 255, 255, 0.06)' },
                    ticks: { color: '#4facfe' }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'Humidity (%)', color: '#00f2fe', font: { size: 14 } },
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#00f2fe' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#a0a0a0', maxTicksLimit: 12 }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#ffffff', usePointStyle: true, pointStyle: 'circle', font: { size: 14 } }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.7)'
                }
            }
        }
    });
}

function pushToChart(timeStr, temperature, humidity) {
    document.getElementById('last-update').innerText = timeStr;

    sht31History.timestamps.push(timeStr);
    sht31History.temperature.push(temperature);
    sht31History.humidity.push(humidity);

    if (sht31History.timestamps.length > MAX_CHART_POINTS) {
        sht31History.timestamps.shift();
        sht31History.temperature.shift();
        sht31History.humidity.shift();
    }

    if (sht31Chart) {
        sht31Chart.data.labels = sht31History.timestamps;
        sht31Chart.data.datasets[0].data = sht31History.temperature;
        sht31Chart.data.datasets[1].data = sht31History.humidity;
        sht31Chart.update('none'); // Smoother transitions without resetting animation layout fully
    }
}

async function startPolling() {
    const btn = document.getElementById('tb-login-btn');
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Spajanje...`;
    
    // Autentifikacija
    const credentials = {
        "username": "antonio.antunovic@ferit.hr",
        "password": "fibonacci112358" 
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
            
            btn.innerHTML = `<i class="fas fa-check"></i> Connected & Live`;
            btn.style.background = "rgba(0, 230, 118, 0.2)";
            btn.style.color = "#00e676";
            btn.style.borderColor = "rgba(0, 230, 118, 0.4)";
            btn.disabled = true;

            // Inicijalno dohvaćanje hrpe starih podataka pa kreće polling svakih 5s
            await fetchData();
            if (tbPollingInterval) clearInterval(tbPollingInterval);
            tbPollingInterval = setInterval(fetchData, 5000);
        } else {
            console.error("Greška provjere:", response.status);
            btn.innerHTML = `<i class="fas fa-times"></i> Login Failed`;
            btn.style.background = "rgba(255, 23, 68, 0.2)";
            btn.style.color = "#ff1744";
        }
    } catch (error) {
        console.error("Greška prijave:", error);
        btn.innerHTML = `<i class="fas fa-wifi"></i> Network Error`;
        btn.style.background = "rgba(255, 23, 68, 0.2)";
        btn.style.color = "#ff1744";
    }
}

async function fetchData() {
    if (!TB_JWT_TOKEN) return;

    // Prvi put povlačimo 30 stavki (da imamo liniju odmah), inače povlačimo 1
    const limit = isFirstFetch ? MAX_CHART_POINTS : 1;
    const endTs = Date.now();
    const startTs = endTs - (10 * 60 * 1000); // zadnjih 10 minuta
    
    const url = `https://${TB_HOST}/api/plugins/telemetry/DEVICE/${TB_DEVICE_ID}/values/timeseries?keys=SHT31&startTs=${startTs}&endTs=${endTs}&limit=${limit}`;

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
            
            if (data.SHT31 && data.SHT31.length > 0) {
                if (isFirstFetch) {
                    // API vraća najnovije prvo. Okrećemo redoslijed kako bi s lijeva na desno išlo od starog prema novom.
                    const items = data.SHT31.reverse();
                    
                    items.forEach(item => {
                        let val = item.value;
                        let sht = typeof val === 'string' ? JSON.parse(val.replace(/[“”]/g, '"')) : val;
                        
                        if (sht.temperature !== undefined && sht.humidity !== undefined) {
                            const timeStr = new Date(item.ts).toLocaleTimeString();
                            pushToChart(timeStr, parseFloat(sht.temperature).toFixed(1), parseFloat(sht.humidity).toFixed(1));
                        }
                    });
                    lastTs = items[items.length - 1].ts;
                    isFirstFetch = false;
                } else {
                    const latestTs = data.SHT31[0].ts;
                    // Ako je novi timestamp (tj. stvarno je nova vrijednost)
                    if (latestTs !== lastTs) {
                        lastTs = latestTs;
                        let val = data.SHT31[0].value;
                        let sht = typeof val === 'string' ? JSON.parse(val.replace(/[“”]/g, '"')) : val;
                        
                        if (sht.temperature !== undefined && sht.humidity !== undefined) {
                            const timeStr = new Date(latestTs).toLocaleTimeString();
                            pushToChart(timeStr, parseFloat(sht.temperature).toFixed(1), parseFloat(sht.humidity).toFixed(1));
                        }
                    }
                }
            }
        } else {
             console.error("HTTP greška:", response.status);
        }
    } catch (error) {
        console.error("Greška pri dohvaćanju telemetrije:", error);
    }
}
