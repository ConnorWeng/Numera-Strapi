import serial
import time
import io
import re
import requests
import json
import time

url = "http://10.168.1.102:1337/api/calls"
API_TOKEN = "45a62b4bdcd4c7d14ae100d0dcbc6616951bcca1cab11362eef22c41ad350cbe31d2b8e53eaf9d17b10ec084c4d1790e9e192fdfaa6f09b490e6f48d9f2363579951be716c92d05f7637ce99565d8beb75470324adb1c6e9cf542f6ca165b28d2a13c544c9454528821d1b75240f1456ae947a402c468fea6716ffcc509ae2ac"

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
ser = serial.Serial("/dev/ttyUSB2", baudrate=9600, timeout=5)
sio = io.TextIOWrapper(io.BufferedRWPair(ser, ser))

time.sleep(1)
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
        time.sleep(0.5)
    except serial.serialutil.SerialException:
        time.sleep(0.5)
