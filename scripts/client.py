from usr import common
from machine import Pin, UART, Timer
from queue import Queue
from misc import Power
import sim, net, dataCall, usocket, ujson, log, utime, checkNet, _thread
import sys
import request
import modem
import app_fota

url = "http://106.14.190.250:1337/api"
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

# 下面两个全局变量是必须有的，用户可以根据自己的实际项目修改下面两个全局变量的值，
# 在执行用户代码前，会先打印这两个变量的值。
CLIENT_NAME = "Numera Quec Python Client"
CLIENT_VERSION = "0.0.1"
checknet = checkNet.CheckNetwork(CLIENT_NAME, CLIENT_VERSION)

q = Queue(1000)
uart = None
jwt_token = None
last_check_upgrade_time = utime.time()

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
    response = request.post(url + '/translates', data=ujson.dumps(request_json), headers=headers, timeout=90)
    response_data = response.json()
    if response.status_code == 200:
        uart.write(ujson.dumps(response_data))
        logger.info('Translate result: {}'.format(response_data))
        if not response_data['done']:
          start_poll(response_data['uid'])
    else:
        logger.error('Translate failed: {}'.format(response_data))

def start_poll(uid):
    try:
        while True:
            data = poll(uid)
            if not data or data['done']:
                break
            utime.sleep_ms(1000)
    except Exception as e:
        logger.error('Poll Exception: {}'.format(e))
        raise e

def poll(uid):
    global jwt_token
    headers = {
        'Content-Type': 'application/json',
        "Authorization": "Bearer " + jwt_token,
    }
    logger.info('Ready to poll task: {}'.format(uid))
    response = request.get(url + '/translates/' + uid + '?clientName=' + CLIENT_NAME.replace(" ", "%20") + '&clientVersion=' + CLIENT_VERSION, headers=headers, timeout=90)
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

def process_queue():
    global q
    try:
        while True:
            queue_wdg.feed()
            if not q.empty():
                task = q.get()
                logger.info('Processing task: {}, remain {} tasks'.format(task, q.size()))
                handle_request(task)
            else:
                if utime.time() - last_check_upgrade_time > 3600:
                    check_upgrade()
                utime.sleep_ms(1000)
    except Exception as e:
        logger.error('Process Queue Exception: {}'.format(e))

def check_upgrade():
    global jwt_token
    global last_check_upgrade_time
    headers = {
        'Content-Type': 'application/json'
    }
    logger.info('Ready to check upgrade')
    response = request.get(url + '/devices/upgrade?clientVersion=' + CLIENT_VERSION, headers=headers, timeout=90)
    response_data = response.json()
    if response.status_code == 200:
        last_check_upgrade_time = utime.time()
        logger.info('Check upgrade result: {}, version: {}'.format(response_data['upgrade'], response_data['version']))
        if response_data['upgrade']:
            fota.download(response_data['url'], '/usr/client.mpy')
            logger.info('Succeed to download the new version')
            fota.set_update_flag()
            logger.info('Upgrading...')
            Power.powerRestart()
    else:
        logger.error('Check upgrade failed: {}'.format(response_data))

def start():
    global uart
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

    check_upgrade()

    uart = UART(UART.UART2, 115200, 8, 0, 1, 0)
    _thread.start_new_thread(uart_read, ())
    _thread.start_new_thread(process_queue, ())
    uart_wdg.start()
    queue_wdg.start()
    logger.info('UART2 initialized.')
