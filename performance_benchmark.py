import requests
import time
import json
import statistics
import argparse
from datetime import datetime

# Configuration
LOCAL_SERVER_URL = "http://localhost:8000/api/update"
SENSOR_ID = "sensor_1"
TEST_DATA = {
    "id": SENSOR_ID,
    "name": "Benchmark Sensor",
    "lat": 45.5550,
    "lng": 18.6761,
    "aqi": 42,
    "pm25": 12.5,
    "temp": 22.0,
    "hum": 45.0
}

def run_benchmark(mode, num_requests=50, simulated_latency=0):
    """
    Runs a performance benchmark by sending multiple requests and measuring latency.
    """
    latencies = []
    print(f"\n--- Starting Benchmark: {mode.upper()} ---")
    if simulated_latency > 0:
        print(f"Simulated Network Latency: {simulated_latency}ms")
    
    print(f"Sending {num_requests} requests...")

    success_count = 0
    start_time_total = time.time()

    for i in range(num_requests):
        try:
            # Prepare payload with fresh timestamp
            payload = TEST_DATA.copy()
            payload["last_update"] = datetime.now().strftime("%H:%M:%S")
            
            # Start timer
            start_tick = time.time()
            
            # Simulated network delay (one way)
            if simulated_latency > 0:
                time.sleep(simulated_latency / 1000.0)
            
            # Actual request
            response = requests.post(LOCAL_SERVER_URL, json=payload, timeout=5)
            
            # End timer
            end_tick = time.time()
            
            # Simulated return delay
            if simulated_latency > 0:
                time.sleep(simulated_latency / 1000.0)
                
            latency_ms = (end_tick - start_tick + (simulated_latency * 2 / 1000.0 if simulated_latency > 0 else 0)) * 1000
            
            if response.status_code == 200:
                latencies.append(latency_ms)
                success_count += 1
            
            if (i + 1) % 10 == 0:
                print(f"Progress: {i + 1}/{num_requests}...")

        except Exception as e:
            print(f"Error at request {i}: {e}")

    total_duration = time.time() - start_time_total
    
    # Analysis
    if latencies:
        avg_latency = statistics.mean(latencies)
        min_latency = min(latencies)
        max_latency = max(latencies)
        throughput = success_count / total_duration
        
        print(f"\nResults for {mode.upper()}:")
        print(f"  Total Successful: {success_count}/{num_requests}")
        print(f"  Average Latency:  {avg_latency:.2f} ms")
        print(f"  Min Latency:      {min_latency:.2f} ms")
        print(f"  Max Latency:      {max_latency:.2f} ms")
        print(f"  Throughput:       {throughput:.2f} req/s")
        
        return {
            "mode": mode,
            "avg": avg_latency,
            "min": min_latency,
            "max": max_latency,
            "throughput": throughput
        }
    else:
        print("No successful requests recorded.")
        return None

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EnvioDev Performance Benchmark Tool")
    parser.add_argument("--mode", choices=["local", "cloud", "compare"], default="compare", help="Test mode")
    parser.add_argument("--n", type=int, default=50, help="Number of requests")
    parser.add_argument("--latency", type=int, default=150, help="Simulated cloud latency in ms")
    
    args = parser.parse_args()

    results = []
    
    if args.mode in ["local", "compare"]:
        local_res = run_benchmark("local", args.n)
        if local_res: results.append(local_res)
        
    if args.mode in ["cloud", "compare"]:
        cloud_res = run_benchmark("cloud", args.n, simulated_latency=args.latency)
        if cloud_res: results.append(cloud_res)

    if args.mode == "compare" and len(results) == 2:
        l, c = results[0], results[1]
        print("\n--- COMPARISON SUMMARY ---")
        print(f"Local is {c['avg']/l['avg']:.1f}x faster in terms of latency.")
        print(f"Cloud simulation shows significant overhead due to WAN round-trip ({args.latency*2}ms added).")
        print("Efficiency Benefit: Local processing provides real-time responsiveness.")
        print("Cloud Benefit: Offloads storage and compute (scalability).")
