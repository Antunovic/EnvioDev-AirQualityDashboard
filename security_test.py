import urllib.request
import json

BASE_URL = "http://localhost:8000"

# 1. TESTIRANJE: NEOVLAŠTENI PRISTUP API-JU (Unauthorized API Access)
# Cilj: Provjeriti odbija li server zahtjeve koji nemaju JWT token ili ključ.
def test_unauthorized_update():
    print("Testing: Unauthorized Data Submission to /api/update")
    payload = {
        "id": "sensor_1",
        "aqi": 999,
        "pm25": 999,
        "temp": 100,
        "hum": 100
    }
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}/api/update", data=data, method='POST')
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req) as f:
            if f.status == 200:
                print("[!] VULNERABILITY: /api/update accepted data without authentication.")
            else:
                print(f"[*] Server responded with {f.status}")
    except urllib.error.HTTPError as e:
        print(f"[*] Server responded with {e.code}")
    except Exception as e:
        print(f"[ERROR] Could not connect to server: {e}")

# 2. TESTIRANJE: INJEKCIJA SADRŽAJA (XSS - Input Injection)
# Cilj: Pokušaj slanja maliciozne skripte kroz metapodatke senzora.
def test_xss_injection():
    print("\nTesting: XSS Injection in Sensor Data")
    payload = {
        "id": "sensor_1",
        "name": "<script>alert('XSS')</script>",
        "aqi": 50
    }
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}/api/update", data=data, method='POST')
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req) as f:
            if f.status == 200:
                print("[!] Data accepted. Check the dashboard to see if the script executes.")
            else:
                print(f"[*] Server responded with {f.status}")
    except urllib.error.HTTPError as e:
        print(f"[*] Server responded with {e.code}")
    except Exception as e:
        print(f"[ERROR] Could not connect to server: {e}")
        
# 3. TESTIRANJE: INTEGRITET PODATAKA (Data Integrity / Malformed JSON)
# Cilj: Provjera stabilnosti servera kada primi neispravno formatiran JSON.
def test_malformed_json():
    print("\nTesting: Malformed JSON Submission")
    data = "{ 'id': 'sensor_1', 'aqi': 'invalid' ".encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}/api/update", data=data, method='POST')
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req) as f:
            print(f"[*] Server responded with {f.status} for malformed JSON")
    except urllib.error.HTTPError as e:
        print(f"[*] Server responded with {e.code} for malformed JSON")
    except Exception as e:
        print(f"[ERROR] Could not connect to server: {e}")

if __name__ == "__main__":
    print("--- Starting Security Tests ---")
    test_unauthorized_update()
    test_xss_injection()
    test_malformed_json()
    print("--- Security Tests Completed ---")
