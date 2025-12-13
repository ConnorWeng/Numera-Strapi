#!/bin/bash

echo "Scanning for open SSH ports..."

for i in {100..109}; do
  (
    ip="10.168.1.$i"
    # Use nc (netcat) for a simpler and often faster check
    if nc -z -w 1 "$ip" 22; then
      echo "$ip"
    fi
  ) &
done

for i in {100..109}; do
  (
    ip="10.168.2.$i"
    # Use nc (netcat) for a simpler and often faster check
    if nc -z -w 1 "$ip" 22; then
      echo "$ip"
    fi
  ) &
done

wait

echo "Scan complete."
