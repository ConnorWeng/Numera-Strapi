import serial
import time
import io
import re
import requests
import json
import time

url = "http://106.14.190.250:1337/api/calls"
API_TOKEN = "4db5bf6ba61e83a2188892e0b76dbdfb6b585c6db7daeebe82c1af8d9217980ded5d3a13bb57b868935778799ce2ed85190da3eee08dcf8370b8a34ef2ba8430649989577fb4ee19eb6e4a9ef4bf0d11dddacf3ff98436c9925c7af9acd210955934e57d29e0143ee8376fea14ab8ed4af8dfc8977f6320d302a4638c70a06e7"

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
ser = serial.Serial("/dev/ttyUSB2", baudrate=115200, timeout=1)
sio = io.TextIOWrapper(io.BufferedRWPair(ser, ser))

time.sleep(5)
ser.write(b"AT+CLIP=1\r")

while True:
    try:
        if sio.readable():
            output = sio.readline().strip()
            print(output)
            find = re.findall(phoneRegex, output)
            if find:
                print(find[0])
                report_call(find[0])
                ser.write(b"AT+CHUP\r")
                time.sleep(1)
        time.sleep(1)
    except serial.serialutil.SerialException:
        time.sleep(1)
