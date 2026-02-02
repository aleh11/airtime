# [Airtime](https://airtime.diy/): Local Time-signal Transmitter

**[Airtime](https://airtime.diy/)** transmits precise time signals over radio frequencies (DCF77, WWVB, MSF, JJY40, JJY60) using the [txtempus](https://github.com/hzeller/txtempus) transmitter. The signal is transmitted through either a ferrite core antenna or a copper wire antenna, both of which require minimal effort to setup. Additionally, a user friendly dashboard is provided to control the system and monitor its status, allowing the addition of custom time offsets and transmission schedules.
<table>
  <tr>
    <td>
      <img src="assets/airtime-2.jpg" width="450"><br>
      <em>Airtime with the custom Pi Hat</em>
    </td>
    <td>
      <img src="assets/airtime-1.jpg" width="450"><br>
      <em>Airtime with additional USB/Ethernet expansion</em>
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center">
      <img src="assets/airtime-dashboard.png" width="900"><br>
      <em>Airtime Dashboard</em>
    </td>
  </tr>
</table>

## Hardware Requirements
This system makes use of several hardware components:
- [Raspberry Pi Zero 2W](https://www.raspberrypi.com/products/raspberry-pi-zero-2-w/)
- USB Power supply 
- MicroSD Card (8GB or larger)
- 3x Jumpers
- Spacers
-  Heatsink
- Aircoil (handmade) / [Ferrite core antenna](https://www.aliexpress.com/item/1005007832198551.html)
- Optional: [Ethernet/USB HUB HAT Expansion](https://www.amazon.com/expansi%25C3%25B3n-USB-HUB-HAT-compatible/dp/B07X1BH5FN?__mk_es_US=%C3%85M%C3%85%C5%BD%C3%95%C3%91&sr=8-1&language=en_US&currency=USD)

### Building the Airtime Hat
Refer to the full user guide on assembling the Airtime Pi Hat [here](docs/airtime-manual.pdf).

## Installing the Airtime software
This proccess assumes you have flashed a Raspberry Pi 2W and have SSH access, this is also covered within the [full user guide](docs/airtime-manual.pdf).

Clone and run **one command** (Ensure you are in the home directory):

```bash
git clone https://github.com/aleh11/airtime.git

cd airtime && sudo ./install.sh
```

The `install.sh` does the following:
- Installs and setups the [txtempus](https://github.com/hzeller/txtempus) binary.
- Installs system packages: `python3`, `sqlite3`, `nginx`, `chrony` (NTP), `git`
- Installs system Python packages: `gpiozero`, `python-crontab` (for GPIO control)
- Installs UV package manager
- Creates virtual environment in `backend/.venv/`
- Sets up database directory with proper permissions
- Configures and starts Chrony NTP client
- Checks frontend build (warns if missing)
- Sets up system service files so the system automatically starts on boot.

**Services created:**

| Service | Description | Port |
|---------|-------------|------|
| `airtime-server` | FastAPI REST API | 8000 |
| `airtime-status` | GPIO/LED/Button control | - |
| `nginx` | Frontend + API proxy | 80 |


After installation, your dashboard will be available at `http://pi-ip-address/`
#### Additional scripts
- `restart.sh` - Restarts all services
- `status.sh` - Displays status of all services

## Using the Airtime UI

The Airtime dashboard provides an easy way to interact with the Airtime pi, and allows full control over the transmitter.

- **System Health**: Real-time monitoring of CPU, RAM, Temperature, and Internet connectivity.
- **Precision Clock**: Displays the time as provided on the Airtime Pi.
- **Broadcast Control**: 
    - Manually start/stop transmissions.
    - Select from all supported time signal standards.
    - Configure transmission duration and custom time offsets.
- **Scheduler**: Automate daily or weekly broadcasts with a user-friendly schedule manager.
- **Additional Features**: 
    - **Stealth Mode**: Toggle hardware LEDs.
    - **Global Offset**: Apply a time offset to all transmissions (usefull for timezone differences on certain services/watches).
    - **Auto-Update**: System updates directly from the UI.
    - **System Restart**: Restart **all** of the system services (invokes the `restart.sh` script).
    - **Pi Reboot**: Reboot the Pi directly from the dashboard UI.

  
## Supported Frequencies and encoding
- **DCF77** - Germany (77.5 kHz)
- **WWVB** - USA (60 kHz)
- **MSF** - UK (60 kHz)
- **JJY40** - Japan (40 kHz)
- **JJY60** - Japan (60 kHz)

## Links

- [**Official website**](https://airtime.diy/)
- [**txtempus repo**](https://github.com/hzeller/txtempus)
- [**Contact us**](mailto:aless.montalto@gmail.com)
