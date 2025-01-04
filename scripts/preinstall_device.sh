#!/bin/bash

# 更新包列表
sudo apt update

# 安装必要的依赖
sudo apt install -y curl git

# 使用NodeSource二进制分发库来安装Node.js v18.20.4
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证Node.js和npm安装
node -v
npm -v

# 配置npm使用proxy
read -p "请输入https代理地址(https://***:***@***.com:443)：" https_proxy
sudo npm config set https-proxy "$https_proxy"
sudo npm config set proxy "$https_proxy"

# 使用npm安装PM2
sudo npm i -g pm2

# 验证PM2安装
pm2 -v

sudo npm i -g lite-http-tunnel

sudo npm config delete https-proxy
sudo npm config delete proxy

read -p "请输入内网穿透服务器端地址(http://xxx.xxx.xxx.xxx:3000)：" tunnel_server
lite-http-tunnel config server "$tunnel_server"
read -p "请输入该设备别名(/xxxx-called)：" device_name
lite-http-tunnel config path "$device_name"
read -p "请输入内网穿透密码：" tunnel_password
lite-http-tunnel auth user "$tunnel_password"

cd /usr/lib/node_modules/lite-http-tunnel
read -p "请输入内网穿透端口(1336/1337)：" tunnel_port
pm2 start client.js -- start $tunnel_port --host 127.0.0.1

pm2 save
pm2 startup
read -p "请输入操作系统用户(root/qaz123)：" os_user
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $os_user --hp "/home/$os_user"

# TODO: copy python script and .env file