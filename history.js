const API_URL = 'http://localhost:8000/api/data';
let trendChart;

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const sensorId = urlParams.get('sensor');
    const metricType = urlParams.get('type');

    if (!sensorId || !metricType) {
        window.location.href = 'index.html';
        return;
    }

    fetchHistoryData(sensorId, metricType);
    // Refresh every 5 seconds
    setInterval(() => fetchHistoryData(sensorId, metricType), 5000);
});

async function fetchHistoryData(sensorId, metricType) {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        const sensor = data.find(s => s.id === sensorId);

        if (sensor && sensor.history) {
            updateUI(sensor, metricType);
            renderChart(sensor.history, metricType);
        }
    } catch (error) {
        console.error('Error fetching history:', error);
    }
}

function updateUI(sensor, type) {
    const titles = {
        'aqi': 'AQI Index Trend',
        'pm25': 'PM2.5 Measurement Trend',
        'temp': 'Temperature Trend',
        'hum': 'Humidity Trend'
    };
    document.getElementById('history-title').innerText = titles[type] || 'Measurement Trend';
    document.getElementById('history-subtitle').innerText = `Real-time updates for ${sensor.name}`;
}

function renderChart(history, type) {
    const ctx = document.getElementById('trendChart').getContext('2d');

    // Process labels (time) and data (values)
    const labels = history.map(h => h.time);
    const dataset = history.map(h => h[type]);

    const colors = {
        'aqi': '#00e676',
        'pm25': '#ff9100',
        'temp': '#4facfe',
        'hum': '#00f2fe'
    };
    const accentColor = colors[type] || '#ffffff';

    if (trendChart) {
        trendChart.data.labels = labels;
        trendChart.data.datasets[0].data = dataset;
        trendChart.update('none'); // Update without animation for smoother real-time feel
    } else {
        trendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: type.toUpperCase(),
                    data: dataset,
                    borderColor: accentColor,
                    backgroundColor: accentColor + '33', // 20% opacity
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: accentColor
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: '#a0a0a0' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#a0a0a0' }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }
}
