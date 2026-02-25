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

## 🔌 Hardware Integration (Real Sensors)

EnvioDev is built to work with real hardware sensors such as the **ESP32** or **Arduino (with Wi-Fi)**. Below is the specification for sending data to the platform.

### API Specification
**Endpoint**: `POST http://[SERVER_IP]:8000/api/update`  
**Content-Type**: `application/json`

**Required JSON Payload**:
```json
{
  "id": "sensor_1",
  "name": "Centar Osijek",
  "lat": 45.5550,
  "lng": 18.6761,
  "aqi": 42,
  "pm25": 12.5,
  "temp": 22.4,
  "hum": 45,
  "last_update": "10:15:30"
}
```

### Arduino/ESP32 Code Example
Below is a C++ snippet using the `HTTPClient` library to send real measurements from a sensor to EnvioDev:

```cpp
#include <WiFi.h>
#include <HTTPClient.h>

const char* serverUrl = "http://YOUR_SERVER_IP:8000/api/update";

void sendData(int aqi, float temp, float hum) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    String json = "{\"id\":\"sensor_1\",\"name\":\"FERIT Campus\",\"lat\":45.5607,\"lng\":18.7183,";
    json += "\"aqi\":" + String(aqi) + ",";
    json += "\"temp\":" + String(temp, 1) + ",";
    json += "\"hum\":" + String(hum, 0) + "}";

    int httpResponseCode = http.POST(json);
    http.end();
  }
}
```

## 🛠 Project Structure
- `index.html`: Main dashboard UI.
- `history.html`: Historical trend visualization.
- `server.py`: Python backend server (Data Ingestion).
- `app.js` & `history.js`: Dashboard logic.
- `styles.css`: Visual design system.
- `logo.png`: EnvioDev logo.

---
*Developed for official air quality monitoring and project reporting.*
