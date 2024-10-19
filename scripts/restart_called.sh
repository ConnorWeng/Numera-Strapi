#!/bin/bash

# 定义最大重试次数
MAX_RETRIES=10

# 定义日志文件路径
LOG_FILE="nohup.out"

# 定义成功标志
SUCCESS_MARKER="OK"

# 定义脚本自身日志文件路径
SCRIPT_LOG_FILE="restart_called.log"

# 将脚本自身的日志重定向到 restart_called.log 并采用追加方式
exec > >(tee -a $SCRIPT_LOG_FILE) 2>&1

# 杀死之前的 called.py 进程
echo "$(date): 杀死之前的 called.py 进程"
sudo pkill -f "python -u called.py"

# 运行 called.py 脚本并将日志重定向到 nohup.out
echo "$(date): 运行 called.py 脚本"
nohup sudo python -u called.py >> $LOG_FILE 2>&1 &

# 等待脚本运行完成
sleep 10

# 检查日志文件的最新 2 行是否包含成功标志
for ((i=1; i<=MAX_RETRIES; i++)); do
    if tail -n 2 $LOG_FILE | grep -q "$SUCCESS_MARKER"; then
        echo "$(date): called.py 成功运行，日志文件包含成功标志。"
        exit 0
    else
        echo "$(date): 第 $i 次尝试失败，重新运行 called.py..."
        # 杀死之前的 called.py 进程
        sudo pkill -f "python -u called.py"
        nohup sudo python -u called.py >> $LOG_FILE 2>&1 &
        sleep 10
    fi
done

echo "$(date): 达到最大重试次数，called.py 仍然未能成功运行。"
exit 1