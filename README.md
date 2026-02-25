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

---

## 🛠 Hardware Implementation Details (MQTT)

As defined in the technical report, EnvioDev nodes utilize the **MQTT protocol** for efficient, low-power data transmission.

### MQTT Specification
- **Broker**: `broker.hivemq.com` (Example)
- **Port**: `1883`
- **Topic**: `enviodev/sensors/osijek`

### Arduino/ESP32 (MQTT) Code Snippet
```cpp
#include <WiFi.h>
#include <PubSubClient.h> // MQTT Library

void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  // Read real sensors...
  float raw = analogRead(34);
  int aqi = map(raw, 200, 3800, 0, 300);

  // Publish JSON Payload
  String payload = "{\"id\":\"sensor_3\",\"aqi\":" + String(aqi) + "}";
  client.publish("enviodev/sensors/osijek", payload.c_str());
  
  delay(15000);
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

