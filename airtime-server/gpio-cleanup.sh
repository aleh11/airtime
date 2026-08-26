#!/bin/bash
for pin in 9 11 5 19; do
    echo $pin > /sys/class/gpio/unexport 2>/dev/null || true
done

pkill -f "systemStatus.py" 2>/dev/null || true
sleep 0.5
exit 0
