# EnvioDev — Air Quality Monitoring Dashboard

EnvioDev is a modern, real-time air quality monitoring system designed for the city of Osijek. It features a sleek glassmorphism dashboard, an interactive map, and historical measurement trends.

![EnvioDev Dashboard](https://raw.githubusercontent.com/Antunovic/EnvioDev-AirQualityDashboard/main/EnvioDev_Demo_Recording.webp)

## 🌟 Features

- **Live Monitoring**: Real-time updates from multiple sensors in Osijek (Centar, Retfala, FERIT Campus).
- **Interactive Map**: Geolocation of sensors with live status indicators.
- **Historical Trends**: Click on any metric (AQI, PM2.5, Temperature, Humidity) to see a 30-point historical line chart.
- **Premium Design**: Dark-themed UI with glassmorphism effects and professional icons.
- **Zero Configuration**: Built with standard Python libraries and vanilla web technologies.

## 🚀 Getting Started

### Prerequisites
- Python 3.x installed on your system.
- A modern web browser (Chrome, Firefox, Safari).

### Running the System
1. **Start the Data Server**:
   ```bash
   python3 server.py
   ```
   *This initializes the backend API and data storage.*

2. **Start the Data Simulator**:
   ```bash
   python3 simulator.py
   ```
   *This simulates live air quality readings for Osijek.*

3. **Open the Dashboard**:
   Double-click `index.html` or open it in your browser.

## 🛠 Project Structure
- `index.html`: Main dashboard UI.
- `history.html`: Dedicated historical trend view using Chart.js.
- `styles.css`: Custom glassmorphism styling.
- `app.js`: Frontend logic and map integration.
- `server.py`: Zero-dependency Python backend server.
- `simulator.py`: Data generation logic.
- `logo.png`: EnvioDev brand logo.

## 📊 Technical Details
The backend is a multi-threaded HTTP server that handles data ingestion via `POST` requests and serves the latest sensor states via `GET`. The simulation generates slightly fluctuating atmospheric data to mimic real-world conditions.

---
*Created for the purpose of the final project report for air quality monitoring.*
