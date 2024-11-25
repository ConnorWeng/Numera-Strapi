import serial
import time
import io
import re
import requests
import json
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse
import threading
import os
import multiprocessing
from dotenv import load_dotenv
from enum import Enum

load_dotenv()

URL = os.getenv("CLOUD_API_URL")
API_TOKEN = os.getenv("CLOUD_API_TOKEN")
DEVICE_OPERATOR = os.getenv("DEVICE_OPERATOR")

class MobileCheckResult(Enum):
    OPEN = 1
    CLOSE = 2

phoneRegex = r"\"(\+?[\d]{7,15})\""
mobileCheckRegex = r"(CDS|CMS)"
CHECK_MOBILE_STATE_TIMEOUT = 10
SET_CLIP_PER_TIMES = 100
ATA_FLAG = 0
HUP_FLAG = 0

queue = multiprocessing.Queue()
lock = multiprocessing.Lock()

class RequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        global ATA_FLAG
        ATA_FLAG = 2
        print("Set ata flag to 2...")
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            if path == '/api/v1/mobile/check':
                self.handle_mobile_check(data)
            else:
                self.handle_hang_up(data)
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON data")

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

    def handle_mobile_check(self, data):
        lock.acquire()

        # Clear the queue
        while not queue.empty():
            queue.get()

        print("Check mobile: " + json.dumps(data))
        ser.write(b"AT+CNMI=2,1,0,1,0\r")
        time.sleep(1)
        ser.write(b"AT+CMGF=0\r")
        time.sleep(1)
        ser.write(b"AT+CMGS=26\r")
        time.sleep(1)
        pdu_string = self.make_mobile_check_pdu(data)
        print("Send mobile check pdu: " + pdu_string)
        ser.write(pdu_string.encode('utf-8'))
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        try:
            result = queue.get(timeout=CHECK_MOBILE_STATE_TIMEOUT)
            if result == MobileCheckResult.OPEN:
                response_data = {"result": "open"}
        except Exception as e:
            response_data = {"result": "close"}
        finally:
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode('utf-8'))
            print("Check mobile state response data: " + json.dumps(response_data))
            lock.release()

    def handle_hang_up(self, data):
        global HUP_FLAG
        HUP_FLAG = 1
        print("Set hup flag...")
        self.send_response(200)
        self.end_headers()

    def make_mobile_check_pdu(self, data):
        operator = data["operator"]
        phone = data["phone"]
        if operator == "CMCC":
            prefix = "0891683108200105F071000D9168"
        elif operator == "CUCC":
            prefix = "0891683110808805F071000D9168"
        else:
            prefix = "0891688109520000F071000D9168"
        if len(phone) % 2 != 0:
            phone += "F"
        odd_chars = ''
        even_chars = ''
        for i in range(len(phone)):
            if i % 2 == 0:
                even_chars += phone[i]
            else:
                odd_chars += phone[i]
        phone_encoded = ''
        for i in range(len(even_chars)):
            phone_encoded += odd_chars[i] + even_chars[i]
        suffix = "0004000B0605040050000000000000\x1a\r"
        return prefix + phone_encoded + suffix

def start_http_server():
    server_address = ('', 1336)
    httpd = HTTPServer(server_address, RequestHandler)
    print('Starting HTTP server...')
    httpd.serve_forever()

# Start the HTTP server in another thread
http_thread = threading.Thread(target=start_http_server)
http_thread.start()

def report_call(callingNumber):
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + API_TOKEN,
    }
    data = {
        "data": {
            "callingNumber": callingNumber,
            "callingTime": int(time.time() * 1000),
            "operator": DEVICE_OPERATOR
        }
    }
    print("Report call data: " + json.dumps(data))
    response = requests.post(URL, headers=headers, data=json.dumps(data))
    if response.status_code == 200:
        print(response.json())
        return response.json()  # Return the JSON response
    else:
        return None

def check_output_for_phone_number(output):
    find = re.findall(phoneRegex, output)
    if find:
        print("Get phone number: " + find[0])
        report_call(find[0])
        if ATA_FLAG == 0:
            ser.write(b"AT+CHUP\r")
        elif ATA_FLAG == 1:
            ser.write(b"ATA\r")

def check_output_for_mobile_state(output):
    find = re.findall(mobileCheckRegex, output)
    if find and find[0] == "CDS":
        queue.put(MobileCheckResult.OPEN)
        print("Mobile state is open")

ser = serial.Serial("/dev/ttyUSB2", baudrate=9600, timeout=1)
sio = io.TextIOWrapper(io.BufferedRWPair(ser, ser))

time.sleep(5)
ser.write(b"AT+CLIP=1\r")
msg = ser.read(64)
print(msg)

timesInRound = 0

while True:
    try:
        if sio.readable():
            output = sio.readline().strip()
            if output:
                print(output)
                check_output_for_phone_number(output)
                check_output_for_mobile_state(output)
        if HUP_FLAG == 1:
            ser.write(b"AT+CHUP\r")
            HUP_FLAG = 0
        if timesInRound >= SET_CLIP_PER_TIMES:
            print("Set clip...")
            ser.write(b"AT+CLIP=1\r")
            timesInRound = 0
        timesInRound += 1
        time.sleep(0.1)
    except serial.serialutil.SerialException:
        time.sleep(0.1)
