import serial
import time
import io
import re
import requests
import json
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
import threading

url = "http://106.14.190.250:1337/api/calls"
API_TOKEN = "4db5bf6ba61e83a2188892e0b76dbdfb6b585c6db7daeebe82c1af8d9217980ded5d3a13bb57b868935778799ce2ed85190da3eee08dcf8370b8a34ef2ba8430649989577fb4ee19eb6e4a9ef4bf0d11dddacf3ff98436c9925c7af9acd210955934e57d29e0143ee8376fea14ab8ed4af8dfc8977f6320d302a4638c70a06e7"

ATA_FLAG = 0
HUP_FLAG = 0

class RequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        global ATA_FLAG
        ATA_FLAG = 2
        print("Set ata flag to 2...")
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        global HUP_FLAG
        HUP_FLAG = 1
        print("Set hup flag...")
        self.send_response(200)
        self.end_headers()

    def do_PUT(self):
        global ATA_FLAG
        ATA_FLAG = 1
        print("Set ata flag...")
        self.send_response(200)
        self.end_headers()

    def do_DELETE(self):
        global ATA_FLAG
        ATA_FLAG = 0
        print("Unset ata flag...")
        self.send_response(200)
        self.end_headers()

def start_http_server():
    server_address = ('', 1336)
    httpd = HTTPServer(server_address, RequestHandler)
    print('Starting HTTP server...')
    httpd.serve_forever()

# Start the HTTP server in another thread
http_thread = threading.Thread(target=start_http_server)
http_thread.start()

""" while True:
    if ATA_FLAG == 0:
        print("Waiting for call...")
    elif ATA_FLAG == 1:
        print("Answering call")
    if HUP_FLAG == 1:
        HUP_FLAG = 0
        print("Hanging up call")
    time.sleep(1) """

def report_call(callingNumber):
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + API_TOKEN,
    }
    data = {
        "data": {
            "callingNumber": callingNumber,
            "callingTime": int(time.time() * 1000)
        }
    }
    response = requests.post(url, headers=headers, data=json.dumps(data))
    if response.status_code == 200:
        print(response.json())
        return response.json()  # Return the JSON response
    else:
        return None

phoneRegex = r"[\d]{11}"
ser = serial.Serial("/dev/ttyUSB2", baudrate=9600, timeout=1)
sio = io.TextIOWrapper(io.BufferedRWPair(ser, ser))

time.sleep(5)
ser.write(b"AT+CLIP=1\r")
msg = ser.read(64)
print(msg)

while True:
    try:
        if sio.readable():
            output = sio.readline().strip()
            if output:
                print(output)
            find = re.findall(phoneRegex, output)
            if find:
                print(find[0])
                report_call(find[0])
                if ATA_FLAG == 0:
                    ser.write(b"AT+CHUP\r")
                elif ATA_FLAG == 1:
                    ser.write(b"ATA\r")
        if HUP_FLAG == 1:
            ser.write(b"AT+CHUP\r")
            HUP_FLAG = 0
        time.sleep(0.1)
    except serial.serialutil.SerialException:
        time.sleep(0.1)
