import socket

info_data_bytes = bytearray.fromhex("e545b328382920666f722064657461690000000000000000000000000000000000000000000000010200043e003e003e003e000856085608560856991799179917991780808080ea")
call_data_bytes = bytearray.fromhex("e539b13436303032393231313632313830300030313233343536373839303132333435363738003133363336363039393635003030303030303030ea")

server_address = ('127.0.0.1', 6000) # replace 'localhost' with server IP if needed

# Create UDP socket
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

# Optional: bind to a specific interface (usually not needed)
# sock.bind((your_interface_address, 0))

sent = sock.sendto(info_data_bytes, server_address)
print(f"Sent {sent} bytes to {server_address}")

sent = sock.sendto(call_data_bytes, server_address)
print(f"Sent {sent} bytes to {server_address}")

sock.close()