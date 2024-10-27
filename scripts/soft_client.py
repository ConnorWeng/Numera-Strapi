import os
import sys
from flask import Flask, request, jsonify
import platform
import uuid
import requests
import json
import threading
import time
import base64
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization

url = "http://106.14.190.250:1337/api"
# url = "http://localhost:1337/api"
app = Flask(__name__)

CLIENT_NAME = "Numera Soft Python Client"
CLIENT_VERSION = "0.0.3"

# 获取当前运行的文件的目录
if getattr(sys, 'frozen', False):
    # 如果是打包后的应用
    base_path = sys._MEIPASS
else:
    # 如果是直接运行的脚本
    base_path = os.path.dirname(__file__)

# 构建 public_key.pem 的路径
key_path = os.path.join(base_path, 'public_key.pem')

# 加载公钥
with open(key_path, 'rb') as key_file:
    public_key = serialization.load_pem_public_key(key_file.read(), backend=default_backend())

jwt_token = None
last_check_upgrade_time = time.time()
device_fingerprint = None
net_status = 0

def get_device_fingerprint():
    global device_fingerprint
    if device_fingerprint is not None:
        return device_fingerprint
    hostname = platform.node()
    mac_address = ':'.join(['{:02x}'.format((uuid.getnode() >> elements) & 0xff) for elements in range(0, 2*6, 2)][::-1])
    system_info = platform.system() + " " + platform.release()
    device_fingerprint = f"{hostname}-{mac_address}-{system_info}"
    return device_fingerprint

def encode_fingerprint(fingerprint):
    # Base64 编码并截取前 15 位
    encoded = base64.b64encode(fingerprint.encode()).decode()
    return encoded[:15]  # 截取前 15 位

def get_encoded_fingerprint():
    return encode_fingerprint(get_device_fingerprint())

def create_signature(data):
    # 生成数字签名
    message = json.dumps(data, sort_keys=True, separators=(',', ':')).encode()
    return public_key.encrypt(
        message,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None
        )
    )

def handle_login(user, password):
    global jwt_token
    data = {
        'identifier': user,
        'password': password,
        'imei': get_encoded_fingerprint()
    }
    headers = {'Content-Type': 'application/json'}
    print('Ready to login: {}'.format(json.dumps(data)))
    response = requests.post(url + '/auth/local', json=data, headers=headers)

    if response.status_code == 200:
        jwt_token = response.json().get('jwt')
        print('JWT token: {}'.format(jwt_token))
    else:
        print('Login failed: {}'.format(response.json().get('error', {}).get('message', 'Unknown error')))

def handle_request(data):
    global jwt_token
    if jwt_token is None:
        handle_login(data['user'], data['password'])
    del data['user']
    del data['password']
    headers = {
        'Content-Type': 'application/json',
        "Authorization": "Bearer " + jwt_token,
    }

    request_json = {
        'clientName': CLIENT_NAME,
        'clientVersion': CLIENT_VERSION,
        'data': data,
        'netStatus': net_status,
    }

    # 创建签名
    signature = create_signature(request_json)

    # 转换签名为可传输格式（例如 base64）
    signature_b64 = base64.b64encode(signature).decode()

    request_json['signature'] = signature_b64

    print('Ready to send data: {}'.format(json.dumps(request_json)))
    response = requests.post(url + '/translates', json=request_json, headers=headers, timeout=900)

    if response.status_code == 200:
        print('Translate result: {}'.format(response.json()))
    else:
        print('Translate failed: {}'.format(response.json()))
    return response.json()

@app.route('/api/translate', methods=['POST'])
def api_task():
    data = request.json
    print('Received task data: {}'.format(data))
    result = handle_request(data)
    return jsonify(result), 200

def check_upgrade():
    global jwt_token
    global last_check_upgrade_time
    headers = {
        'Content-Type': 'application/json'
    }
    print('Ready to check upgrade')
    response = requests.get(url + '/devices/upgrade?clientVersion=' + CLIENT_VERSION, headers=headers, timeout=900)

    if response.status_code == 200:
        last_check_upgrade_time = time.time()
        print('Check upgrade result: {}'.format(response.json()))
    else:
        print('Check upgrade failed: {}'.format(response.json()))

def heartbeat():
    global net_status
    headers = {
        'Content-Type': 'application/json'
    }
    request_json = {
        'data': {
            'imei': get_encoded_fingerprint()
        }
    }
    while True:
        print('Ready to send heartbeat: {}'.format(json.dumps(request_json)))
        response = requests.post(url + '/devices/heartbeat', json=request_json, headers=headers, timeout=900)
        if response.status_code == 200:
            net_status = 0
        else:
            net_status = 1
            print('Heartbeat failed: {}'.format(response.json()))
        time.sleep(60)

def start():
    check_upgrade()
    threading.Thread(target=heartbeat).start()

# 启动 Flask 服务器
if __name__ == '__main__':
    threading.Thread(target=app.run, kwargs={'host': '0.0.0.0', 'port': 8888}).start()
    start()
