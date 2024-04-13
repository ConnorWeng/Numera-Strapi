from usr import common
from machine import Pin, UART, Timer
from queue import Queue
import sim, net, dataCall, usocket, ujson, log, utime, checkNet, _thread
import sys
import request

url = "http://106.14.190.250:1337/api"

# 华DTU板喂狗脚本. 必须存在, 否则模块会反复复位
work = Pin(Pin.GPIO12, Pin.OUT, Pin.PULL_PU, 0)
def wdg_feed(args):
    global work
    if work.read() == 1:
        work.write(0)
    else:
        work.write(1)
wdg_time = Timer(Timer.Timer0)
wdg_time.start(period=1000, mode=wdg_time.PERIODIC, callback=wdg_feed)

# 下面两个全局变量是必须有的，用户可以根据自己的实际项目修改下面两个全局变量的值，
# 在执行用户代码前，会先打印这两个变量的值。
CLIENT_NAME = "Numera Quec Python Client"
CLIENT_VERSION = "0.0.1"
checknet = checkNet.CheckNetwork(CLIENT_NAME, CLIENT_VERSION)

# | 参数      | 参数类型 | 说明                | 类型      |
# | -------- | ------- | ------------------ | -------- |
# | CRITICAL | 常量     | 日志记录级别的数值 50 | critical |
# | ERROR    | 常量     | 日志记录级别的数值 40 | error    |
# | WARNING  | 常量     | 日志记录级别的数值 30 | warning  |
# | INFO     | 常量     | 日志记录级别的数值 20 | info     |
# | DEBUG    | 常量     | 日志记录级别的数值 10 | debug    |
# | NOTSET   | 常量     | 日志记录级别的数值 0  | notset   |
# log.basicConfig(level=log.INFO)   # 设置日志输出级别
logger = common.LogAdapter("Numera-Quec-Python-Client")
logger.log_service.logtimeflag = True  # 设置LOG时间输出: True; False.
logger.log_service.LEVEL = common.LOG_LV.DEBUG  # 设置LOG输出等级: DEBUG; INFO; CRITICAL; WARNING; ERROR.

q = Queue(1000)
uart = None
jwt_token = None

def handle_login(user, password):
    global jwt_token
    data = {
        'identifier': user,
        'password': password
    }
    headers = {'Content-Type': 'application/json'}
    response = request.post(url + '/auth/local', data=ujson.dumps(data), headers=headers)
    response_data = response.json()
    if response.status_code == 200:
        jwt_token = response_data['jwt']
        logger.info('JWT token: {}'.format(jwt_token))
    else:
        logger.error('Login failed: {}'.format(response_data['error']['message']))

def handle_request(json_string):
    global jwt_token
    json = ujson.loads(json_string)
    if jwt_token is None:
        handle_login(json['user'], json['password'])
    del json['user']
    del json['password']
    headers = {
        'Content-Type': 'application/json',
        "Authorization": "Bearer " + jwt_token,
    }
    request_json = {
        'clientName': CLIENT_NAME,
        'clientVersion': CLIENT_VERSION,
        'data': json
    }
    logger.info('Ready to send data: {}'.format(ujson.dumps(request_json)))
    response = request.post(url + '/translates', data=ujson.dumps(request_json), headers=headers, timeout=50)
    response_data = response.json()
    if response.status_code == 200:
        uart.write(ujson.dumps(response_data))
        logger.info('Translate result: {}'.format(response_data))
    else:
        logger.error('Translate failed: {}'.format(response_data['error']['message']))

def uart_read():
    global uart
    try:
        while True:
            msglen = uart.any()  # 返回是否有可读取的数据长度
            # 当有数据时进行读取
            if msglen:
                msg = uart.read(msglen)
                # 初始数据是字节类型（bytes）,将字节类型数据进行编码
                utf8_msg = msg.decode()
                q.put(utf8_msg)
                logger.info('uart recv {} bytes data: {}'.format(len(utf8_msg), utf8_msg))
            else:
                utime.sleep_ms(1)
    except Exception as e:
        logger.error('UART Read Exception: {}'.format(e))
        sys.exit(1)

def process_queue():
    global q
    try:
        while True:
            if not q.empty():
                task = q.get()
                logger.info('Processing task: {}, remain {} tasks'.format(task, q.size()))
                handle_request(task)
            else:
                utime.sleep_ms(1000)
    except Exception as e:
        logger.error('Process Queue Exception: {}'.format(e))
        sys.exit(1)

if __name__ == "__main__":
    # utime.sleep(5)  # 手动运行本例程时, 可以去掉该延时, 如果将例程文件名改为main.py, 希望开机自动运行时, 需要加上该延时.
    checknet.poweron_print_once()  # CDC口打印poweron_print_once()信息, 注释则无法从CDC口看到下面的poweron_print_once()中打印的信息.

    stage, state = checknet.wait_network_connected(5)  # 等待网络就绪(拨号成功)时间设置.
    logger.info('stage: {}, state: {}'.format(stage, state))
    # stage = 3, state = 1 网络已就绪
    # stage = 1, state = 0 没插sim卡
    # stage = 1, state = 2 sim卡被锁
    # stage = 2, state = 0 超时未注网
    if stage == 3 and state == 1:
        logger.info('Network connection successful.')
    else:
        logger.error('Network connection failed.')

    uart = UART(UART.UART2, 115200, 8, 0, 1, 0)
    _thread.start_new_thread(uart_read, ())
    _thread.start_new_thread(process_queue, ())
    logger.info('UART2 initialized.')
