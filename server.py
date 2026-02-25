import http.server
import json
import threading
from urllib.parse import urlparse

import os
import psycopg2
from psycopg2 import extras

# --- DATABASE CONFIGURATION ---
# Update these with your local TimescaleDB/Postgres credentials
DB_CONFIG = {
    "dbname": "postgres",
    "user": "postgres",
    "password": "your_password",
    "host": "localhost",
    "port": "5432"
}

# Shared storage for current sensor states (in-memory cache)
sensor_data = {
    "sensor_1": {"id": "sensor_1", "name": "Centar Osijek", "lat": 45.5550, "lng": 18.6761, "aqi": 0, "pm25": 0, "temp": 0, "hum": 0, "last_update": "Never", "history": []},
    "sensor_2": {"id": "sensor_2", "name": "Retfala", "lat": 45.5644, "lng": 18.6468, "aqi": 0, "pm25": 0, "temp": 0, "hum": 0, "last_update": "Never", "history": []},
    "sensor_3": {"id": "sensor_3", "name": "FERIT Campus", "lat": 45.5607, "lng": 18.7183, "aqi": 0, "pm25": 0, "temp": 0, "hum": 0, "last_update": "Never", "history": []}
}

class DatabaseManager:
    def __init__(self, config):
        self.config = config
        self.conn = None

    def connect(self):
        try:
            self.conn = psycopg2.connect(**self.config)
            print("Successfully connected to TimescaleDB")
        except Exception as e:
            print(f"Error connecting to TimescaleDB: {e}")
            self.conn = None

    def insert_reading(self, data):
        if not self.conn: self.connect()
        if not self.conn: return

        try:
            with self.conn.cursor() as cur:
                query = """
                INSERT INTO sensor_data (time, sensor_id, name, lat, lng, aqi, pm25, temp, hum)
                VALUES (NOW(), %s, %s, %s, %s, %s, %s, %s, %s)
                """
                cur.execute(query, (
                    data.get('id'),
                    data.get('name'),
                    data.get('lat'),
                    data.get('lng'),
                    data.get('aqi'),
                    data.get('pm25'),
                    data.get('temp'),
                    data.get('hum')
                ))
                self.conn.commit()
        except Exception as e:
            print(f"DB Insert Error: {e}")
            self.conn = None # Reset connection for retry

    def get_history(self, sensor_id, limit=30):
        if not self.conn: self.connect()
        if not self.conn: return []

        try:
            with self.conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
                query = """
                SELECT to_char(time, 'HH24:MI:SS') as time, aqi, pm25, temp, hum
                FROM sensor_data
                WHERE sensor_id = %s
                ORDER BY time DESC
                LIMIT %s
                """
                cur.execute(query, (sensor_id, limit))
                # Return in chronological order for the chart
                results = cur.fetchall()
                history = [dict(row) for row in reversed(results)]
                return history
        except Exception as e:
            print(f"DB Fetch Error: {e}")
            self.conn = None
            return []

db = DatabaseManager(DB_CONFIG)

class DashboardHandler(http.server.BaseHTTPRequestHandler):
    def end_headers(self):
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
            # Enrich sensor_data with the latest history from the database
            for sid in sensor_data:
                sensor_data[sid]["history"] = db.get_history(sid)
                if sensor_data[sid]["history"]:
                    last = sensor_data[sid]["history"][-1]
                    sensor_data[sid].update({
                        "aqi": last["aqi"],
                        "pm25": last["pm25"],
                        "temp": last["temp"],
                        "hum": last["hum"],
                        "last_update": last["time"]
                    })

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
                    # 1. Update in-memory cache for immediate status
                    sensor_data[sensor_id].update(data)
                    
                    # 2. Persist to TimescaleDB
                    db.insert_reading(data)
                    
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
