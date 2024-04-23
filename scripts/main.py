import uos
import example

files = uos.listdir('/usr/')

if 'client.py' in files:
  print('client.py found')
  example.exec('/usr/client.mpy')

if 'client.mpy' in files:
  print('client.mpy found')
  example.exec('/usr/client.mpy')