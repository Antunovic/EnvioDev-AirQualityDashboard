import http.server
import json
import threading
from urllib.parse import urlparse

# Shared storage for sensor data
sensor_data = {
    "sensor_1": {"id": "sensor_1", "name": "Centar Osijek", "lat": 45.5550, "lng": 18.6761, "aqi": 0, "pm25": 0, "temp": 0, "hum": 0, "last_update": "Never", "history": []},
    "sensor_2": {"id": "sensor_2", "name": "Retfala", "lat": 45.5644, "lng": 18.6468, "aqi": 0, "pm25": 0, "temp": 0, "hum": 0, "last_update": "Never", "history": []},
    "sensor_3": {"id": "sensor_3", "name": "FERIT Campus", "lat": 45.5607, "lng": 18.7183, "aqi": 0, "pm25": 0, "temp": 0, "hum": 0, "last_update": "Never", "history": []}
}

class DashboardHandler(http.server.BaseHTTPRequestHandler):
    def end_headers(self):
        # Allow requests from any origin for ease of use in local development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed_path = urlparse(self.path)
        if parsed_path.path == '/api/data':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(list(sensor_data.values())).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        parsed_path = urlparse(self.path)
        if parsed_path.path == '/api/update':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                sensor_id = data.get('id')
                if sensor_id in sensor_data:
                    # Save history (timestamp and values)
                    history_entry = {
                        "time": data.get('last_update'),
                        "aqi": data.get('aqi'),
                        "pm25": data.get('pm25'),
                        "temp": data.get('temp'),
                        "hum": data.get('hum')
                    }
                    sensor_data[sensor_id]["history"].append(history_entry)
                    # Keep last 30 entries
                    if len(sensor_data[sensor_id]["history"]) > 30:
                        sensor_data[sensor_id]["history"].pop(0)
                        
                    # Update current data
                    sensor_data[sensor_id].update(data)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "success"}).encode())
                else:
                    self.send_response(404)
                    self.end_headers()
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(str(e).encode())
        else:
            self.send_response(404)
            self.end_headers()

def run_server(port=8000):
    server_address = ('', port)
    httpd = http.server.HTTPServer(server_address, DashboardHandler)
    print(f"Server running on port {port}...")
    print("Keep this script running while you use the dashboard!")
    httpd.serve_forever()

if __name__ == "__main__":
    run_server()
