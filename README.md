# EnvioDev — Air Quality Monitoring Dashboard

EnvioDev is a modern, real-time air quality monitoring platform designed for official air quality reporting. It features a dashboard, interactive mapping, and historical measurement trends.

![EnvioDev Dashboard Demonstration](https://raw.githubusercontent.com/Antunovic/EnvioDev-AirQualityDashboard/main/EnvioDev_Demo_Recording.webp)

## 🌟 Features
- **Real-Time Data Ingestion**: Open API for hardware sensors (ESP32, Arduino, Raspberry Pi).
- **Interactive Map**: Geolocation of active hardware nodes in Osijek.
- **Historical Trends**: 30-point live-updating line charts for every metric.
- **Premium UI**: Dark-themed, glassmorphism interface.
- **Zero-Dependency Backend**: Lightweight Python server for data handling.

## 🚀 Deployment

### 1. Start the Data Server
Run the backend API to begin receiving measurements:
```bash
python3 server.py
```
*The server listens on port 8000. Ensure this port is open on your network.*

### 2. View the Dashboard
Double-click `index.html` on any machine connected to the network where the server is running.

---

## 🔌 Hardware Integration & Architecture

EnvioDev is designed to follow professional IoT patterns for reliable data exchange and storage.

### 1. Data Exchange (MQTT & REST)
The system currently implements a high-performance **REST API gateway**. While the prototype uses HTTP `POST` for ease of local deployment, the architecture is designed to sit behind an **MQTT Broker** (e.g., Mosquitto). 
- In a full deployment, sensors act as **Publishers** (MQTT), and a bridge service acts as a **Subscriber** that relays data to the EnvioDev backend via the provided API.
- This ensures compatibility with the **Publish-Subscribe model** described in the technical report.

### 2. Time-Series Storage (Persistent Data)
Data is managed using a logic consistent with **TimescaleDB** (PostgreSQL-based time-series database).
- **Hypertable Simulation**: The backend automatically partitions incoming data by sensor ID and timestamp.
- **Persistence**: For portability in this demo, data is persisted to an optimized `data_history.json` file, mimicking the table structure and time-partitioning features of TimescaleDB.

### 3. Presentation Layer: Why Custom Web UI?
During initial development, **Grafana** was used as a validation tool for time-series visualization (as seen in the report's testing phase). However, for the final **EnvioDev Presentation Layer**, a custom web solution was chosen over Grafana for several key reasons:
- **Branded Experience**: Full control over the "EnvioDev" aesthetic (Glassmorphism, custom typography).
- **Integrated Mapping**: Seamless integration of Leaflet maps with live status pulses, which is more interactive and responsive than generic Grafana panels.
- **Ease of Use**: A simplified, focused interface for non-technical users in Osijek, avoiding the complexity of a full monitoring suite.
- **Optimized Performance**: Direct data binding for historical charts using Chart.js, resulting in faster load times and smoother animations.

---

## 🛠 Hardware Implementation Details

### API Specification
**Endpoint**: `POST http://[SERVER_IP]:8000/api/update`  
**Content-Type**: `application/json`

```json
{
  "id": "sensor_1",
  "name": "Centar Osijek",
  "lat": 45.5550, "lng": 18.6761,
  "aqi": 42, "pm25": 12.5, "temp": 22.4, "hum": 45,
  "last_update": "10:15:30"
}
```

### Arduino/ESP32 Code Snippet
```cpp
#include <WiFi.h>
#include <HTTPClient.h>

void sendData(int aqi, float temp, float hum) {
  HTTPClient http;
  http.begin("http://YOUR_SERVER_IP:8000/api/update");
  http.addHeader("Content-Type", "application/json");
  String json = "{\"id\":\"sensor_1\",\"aqi\":" + String(aqi) + ",\"temp\":" + String(temp, 1) + "}";
  http.POST(json);
  http.end();
}
```

## 📂 Project Structure
- `index.html`: Main dashboard UI.
- `history.html`: Historical trend visualization.
- `server.py`: Python backend server (Hypertable simulation).
- `app.js` & `history.js`: Dashboard logic.
- `styles.css`: Visual design system.
- `logo.png`: EnvioDev logo.

---

