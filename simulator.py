import http.client
import json
import time
import random
from datetime import datetime

# Server configuration
SERVER_HOST = 'localhost'
SERVER_PORT = 8000

# Sensor definitions
SENSORS = [
    {"id": "sensor_1", "name": "Centar Osijek", "lat": 45.5550, "lng": 18.6761},
    {"id": "sensor_2", "name": "Retfala", "lat": 45.5644, "lng": 18.6468},
    {"id": "sensor_3", "name": "FERIT Campus", "lat": 45.5607, "lng": 18.7183}
]

def send_data(sensor_id, data):
    try:
        conn = http.client.HTTPConnection(SERVER_HOST, SERVER_PORT)
        headers = {'Content-Type': 'application/json'}
        payload = json.dumps(data)
        conn.request('POST', '/api/update', payload, headers)
        response = conn.getresponse()
        conn.close()
        return response.status == 200
    except Exception as e:
        print(f"Error sending data: {e}")
        return False

def simulate():
    print("Starting simulation... (Press Ctrl+C to stop)")
    print(f"Sending data to http://{SERVER_HOST}:{SERVER_PORT}")
    
    # Base values for realistic simulation
    base_values = {
        "sensor_1": {"aqi": 45, "temp": 22, "hum": 45},
        "sensor_2": {"aqi": 85, "temp": 24, "hum": 40},
        "sensor_3": {"aqi": 30, "temp": 20, "hum": 55}
    }

    while True:
        for sensor in SENSORS:
            sid = sensor["id"]
            # Generate slightly fluctuating random data
            aqi = max(0, base_values[sid]["aqi"] + random.randint(-5, 5))
            temp = base_values[sid]["temp"] + round(random.uniform(-0.5, 0.5), 1)
            hum = max(0, min(100, base_values[sid]["hum"] + random.randint(-2, 2)))
            pm25 = round(aqi * 0.5, 1) # PM2.5 roughly proportional to AQI for simplicity
            
            payload = {
                "id": sid,
                "name": sensor["name"],
                "lat": sensor["lat"],
                "lng": sensor["lng"],
                "aqi": aqi,
                "pm25": pm25,
                "temp": temp,
                "hum": hum,
                "last_update": datetime.now().strftime("%H:%M:%S")
            }
            
            success = send_data(sid, payload)
            if success:
                print(f"[{payload['last_update']}] Sent data for {sensor['name']}: AQI {aqi}, Temp {temp}°C")
            else:
                print(f"Failed to send data for {sensor['name']}. Is server.py running?")
        
        time.sleep(3) # Wait 3 seconds before next update

if __name__ == "__main__":
    simulate()
