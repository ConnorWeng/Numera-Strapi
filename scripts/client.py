from usr import common
from machine import Pin, UART, Timer
from queue import Queue
from misc import Power
import ujson, utime, checkNet, _thread
import sys
import request
import modem
import app_fota

API_REQUEST_TYPE = {
    'REGULAR': 1,
    'LEGACY': 2
}
DEFAULT_PASSWORD = "wy1234"
SERVER_IP = "106.14.190.250"
url = "http://" + SERVER_IP + ":1337/api"
fota = app_fota.new()

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

def mask_ip(log_message):
    """
    Replace IP address in the log message with *.*.*.*
    """
    return log_message.replace(SERVER_IP, '*.*.*.*')

def raise_for_clean_error_message(e):
    # 清理异常信息中的 IP 地址
    error_message = str(e)
    cleaned_message = mask_ip(error_message)  # 替换成通用信息
    raise Exception(cleaned_message) from None

class WatchDog:
    def __init__(self, max_count):
        self.__max_count = max_count
        self.__count = self.__max_count
        self.__tid = None

    def __bark(self):
        logger.info('WatchDog: I will restart the system.')
        Power.powerRestart()

    def __check(self):
        while True:
            if self.__count == 0:
                self.__bark()
            else:
                self.__count = (self.__count - 1)
            utime.sleep(10)

    def start(self):
        if not self.__tid or (self.__tid and not _thread.threadIsRunning(self.__tid)):
            try:
                _thread.stack_size(0x1000)
                self.__tid = _thread.start_new_thread(self.__check, ())
                logger.info('WatchDog[{}]: I am watching you.'.format(self.__tid))
            except Exception as e:
                sys.print_exception(e)

    def stop(self):
        if self.__tid:
            try:
                _thread.stop_thread(self.__tid)
            except:
                pass
        self.__tid = None

    def feed(self):
        self.__count = self.__max_count

uart_wdg = WatchDog(10)
queue_wdg = WatchDog(10)
heartbeat_wdg = WatchDog(18)

# 下面两个全局变量是必须有的，用户可以根据自己的实际项目修改下面两个全局变量的值，
# 在执行用户代码前，会先打印这两个变量的值。
CLIENT_NAME = "Numera Quec Python Client"
CLIENT_VERSION = "0.0.8"
checknet = checkNet.CheckNetwork(CLIENT_NAME, CLIENT_VERSION)

q = Queue(1000)
uart = None
jwt_token = None
last_check_upgrade_time = utime.time()
net_status = 0

def handle_login(user, password):
    global jwt_token
    data = {
        'identifier': user,
        'password': password,
        'imei': modem.getDevImei()
    }
    headers = {'Content-Type': 'application/json'}
    logger.info('Ready to login: {}'.format(ujson.dumps(data)))
    response = request.post(url + '/auth/local', data=ujson.dumps(data), headers=headers)
    response_data = response.json()
    if response.status_code == 200:
        jwt_token = response_data['jwt']
        logger.info('JWT token: {}'.format(jwt_token))
    else:
        logger.error('Login failed: {}'.format(response_data['error']['message']))
        error_json = {
            'error': 'Login failed: {}'.format(response_data['error']['message'])
        }
        uart.write(ujson.dumps(error_json))

def handle_request(json_string):
    global jwt_token
    global net_status
    json = ujson.loads(json_string.strip())
    if 'password' not in json:
        json['password'] = DEFAULT_PASSWORD
    if jwt_token is None:
        handle_login(json['user'], json['password'])
    del json['user']
    del json['password']
    headers = {
        'Content-Type': 'application/json',
        "Authorization": "Bearer " + jwt_token,
    }

    use_request_type = (
        API_REQUEST_TYPE['LEGACY']
        if 'imsii' in json and json['imsii']
        else API_REQUEST_TYPE['REGULAR']
    )

    if use_request_type == API_REQUEST_TYPE['LEGACY']:
        json['IMSI'] = json['imsii']
        json['mode'] = 0

    request_json = {
        'clientName': CLIENT_NAME,
        'clientVersion': CLIENT_VERSION,
        'data': json,
        'netStatus': net_status,
    }

    if use_request_type == API_REQUEST_TYPE['LEGACY']:
        uart.write(format_status_report(request_json))
    else:
        uart.write(ujson.dumps(request_json))

    logger.info('Ready to send data: {}'.format(ujson.dumps(request_json)))

    if json['mode'] == 9:
        api_path = '/detects'
    else:
        api_path = '/translates'

    response = request.post(url + api_path, data=ujson.dumps(request_json), headers=headers, timeout=900)
    response_data = response.json()
    if response.status_code == 200:
        uart.write(ujson.dumps(response_data))
        logger.info('Translate result: {}'.format(response_data))
        if not response_data['done']:
          start_poll(response_data['uid'])
    else:
        logger.error('Translate failed: {}'.format(response_data))
        error_json = {
            'error': 'Translate failed: {}'.format(response_data)
        }
        uart.write(ujson.dumps(error_json))

def start_poll(uid):
    try:
        while True:
            data = poll(uid)
            if not data or data['done']:
                break
            utime.sleep_ms(1000)
    except Exception as e:
        logger.error(mask_ip('Poll Exception: {}'.format(e)))
        raise_for_clean_error_message(e)

def poll(uid):
    global jwt_token
    headers = {
        'Content-Type': 'application/json',
        "Authorization": "Bearer " + jwt_token,
    }
    logger.info('Ready to poll task: {}'.format(uid))
    response = request.get(url + '/translates/' + uid + '?clientName=' + CLIENT_NAME.replace(" ", "%20") + '&clientVersion=' + CLIENT_VERSION, headers=headers, timeout=900)
    response_data = response.json()
    if response.status_code == 200:
        uart.write(ujson.dumps(response_data))
        logger.info('Poll result: {}'.format(response_data))
        return response_data
    else:
        logger.error('Poll failed: {}'.format(response_data))
        return False

def uart_read():
    global uart
    try:
        while True:
            uart_wdg.feed()
            msglen = uart.any()  # 返回是否有可读取的数据长度
            # 当有数据时进行读取
            if msglen > 1:
                msg = uart.read(msglen)
                # 初始数据是字节类型（bytes）,将字节类型数据进行编码
                utf8_msg = msg.decode()
                q.put(utf8_msg)
                logger.info('uart recv {} bytes data: {}'.format(len(utf8_msg), utf8_msg))
            else:
                utime.sleep_ms(1)
    except Exception as e:
        logger.error('UART Read Exception: {}'.format(e))

def process_queue():
    global q
    try:
        while True:
            queue_wdg.feed()
            if not q.empty():
                task = q.get()
                logger.info('Processing task: {}, remain {} tasks'.format(task, q.size()))
                try:
                    handle_request(task)
                except Exception as e:
                    logger.error(mask_ip('Handle Request Exception, skip task: {}'.format(e)))
            else:
                if utime.time() - last_check_upgrade_time > 3600:
                    check_upgrade()
                utime.sleep_ms(1000)
    except Exception as e:
        logger.error(mask_ip('Process Queue Exception: {}'.format(e)))

def check_upgrade():
    global jwt_token
    global last_check_upgrade_time
    try:
        headers = {
            'Content-Type': 'application/json'
        }
        logger.info('Ready to check upgrade')
        response = request.get(url + '/devices/upgrade?clientVersion=' + CLIENT_VERSION, headers=headers, timeout=900)
        response_data = response.json()
        if response.status_code == 200:
            last_check_upgrade_time = utime.time()
            logger.info(mask_ip('Check upgrade result: {}, version: {}'.format(response_data['upgrade'], response_data['version'])))
            if response_data['upgrade']:
                fota.download(response_data['url'], '/usr/client.mpy')
                logger.info('Succeed to download the new version')
                fota.set_update_flag()
                logger.info('Upgrading...')
                Power.powerRestart()
        else:
            logger.error(mask_ip('Check upgrade failed: {}'.format(response_data)))
    except Exception as e:
        logger.error(mask_ip('Check upgrade Exception: {}'.format(e)))
        raise_for_clean_error_message(e)

def heartbeat():
    global net_status
    headers = {
        'Content-Type': 'application/json'
    }
    request_json = {
        'data': {
            'imei': modem.getDevImei()
        }
    }
    try:
        while True:
            logger.info('Ready to send heartbeat: {}'.format(ujson.dumps(request_json)))
            response = request.post(url + '/devices/heartbeat', data=ujson.dumps(request_json), headers=headers, timeout=900)
            response_data = response.json()
            if response.status_code == 200:
                heartbeat_wdg.feed()
                net_status = 0
            else:
                net_status = 1
                logger.error('Heartbeat failed: {}'.format(response_data))
            request_json['netStatus'] = net_status
            uart.write(ujson.dumps(request_json))
            utime.sleep(60)
    except Exception as e:
        logger.error(mask_ip('Heartbeat Exception: {}'.format(e)))

def format_status_report(data):
    if data['netStatus'] == 0:
        return "handling your request, stage=3, state=1"
    else:
        return "handling your request, stage=3, state=0"

def start():
    global uart
    global net_status
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
        net_status = 1
        logger.error('Network connection failed.')

    uart_wdg.start()
    queue_wdg.start()
    heartbeat_wdg.start()

    check_upgrade()

    uart = UART(UART.UART2, 115200, 8, 0, 1, 0)
    _thread.start_new_thread(uart_read, ())
    _thread.start_new_thread(process_queue, ())
    _thread.start_new_thread(heartbeat, ())
    logger.info('UART2 initialized.')
