# [AirTime](https://airtime.diy/): Local Time-signal Transmitter

**[AirTime](https://airtime.diy/)** transmits precise time signals over radio frequencies (DCF77, WWVB, MSF, JJY40, JJY60) using the [txtempus](https://github.com/hzeller/txtempus) transmitter. The signal is transmitted through either a ferrite core antenna or a copper wire antenna, both of which require minimal effort to setup. Additionally, a user friendly dashboard is provided to control the system and monitor its status, allowing the addition of custom time offsets and transmission schedules.
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
Refer to the full user guide on assembling the Airtime Pi Hat [here](docs/Airtime3.pdf).

## Installing the Airtime software
This process assumes you have flashed a Raspberry Pi 2W and have SSH access, this is also covered within the [full user guide](docs/Airtime3.pdf).

Run **one command**:

```bash
curl -fsSL https://github.com/aleh11/airtime/releases/latest/download/install.sh | sudo bash
```

> **Already running AirTime from before 1 September 2026?**
> Don't run the command above yet — your Pi can move itself across, and there is
> a recovery path if it can't. Skip to
> [Moving an older AirTime to 2.0](#moving-an-older-airtime-to-20).

The installer downloads a single verified binary — no git clone, no Python environment, no nginx. It:
- Verifies the release against its published `sha256` before installing anything
- Installs and sets up the [txtempus](https://github.com/hzeller/txtempus) binary
- Installs `chrony` (NTP) and configures it
- Creates the state directory at `/var/lib/airtime` (databases from older installs are migrated automatically on first start)
- Registers the `airtime` service so the system starts on boot
- Retires any previous Python-based install it finds

**Services created:**
- `airtime`: the daemon — REST API, dashboard, scheduler and GPIO in one binary
- `airtime-update.path`: watches for update requests from the dashboard

To remove it again, run `sudo ./uninstall.sh` (add `--purge` to delete your schedules and settings too).

After installation, your dashboard will be available at `https://pi-ip-address`. Plain
HTTP redirects to it, and `https://pi-ip-address:8443` keeps working, so any address you
have bookmarked still reaches it.
#### Useful commands
- `sudo systemctl restart airtime` - Restart the service
- `sudo systemctl status airtime` - Check the service
- `sudo journalctl -u airtime -f` - Follow the logs

## Using the Airtime UI

The Airtime dashboard provides an easy way to interact with the Airtime pi, and allows full control over the transmitter, there is a live dashboard available [here](https://airtime.ddns.net:8443).

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
    - **Auto-Update**: Installs the latest GitHub release directly from the UI, verified by checksum.
    - **Beta Releases**: The flask icon in the header opts this Pi into beta builds, published from every change to the development branch. Switch back to stable at any time; your Pi stays on the build it is running rather than being downgraded.
    - **System Restart**: Restart the AirTime service.
    - **Pi Reboot**: Reboot the Pi directly from the dashboard UI.

The UI is also fully covered within the [full user guide](docs/Airtime3.pdf), so if you still have questions, refer to that document.
  
## Moving an older AirTime to 2.0

AirTime 2.0 replaces the Python services, nginx and the git checkout with a
single binary. Your schedules, offsets and settings are kept.

### The normal way: click the update button

Open your dashboard as usual. The **Update Available** banner appears, and
clicking **Update Now** does the whole thing for you.

It takes noticeably longer than an update used to — it downloads and verifies
the release, and on some Pis rebuilds the transmitter from source. **The
dashboard will go unresponsive partway through, and may look like it has
failed. That is the old services being retired; leave it alone.** Give it up to
ten minutes, then reload the page.

When it comes back you'll be on the new dashboard, at your Pi's address with no
port number.

### If the button doesn't work

Some older installs cannot update themselves. You'll recognise them by any of:

- the dashboard reports its version or commit as **`unknown`**
- it insists it is **up to date** no matter how long you wait
- you click **Update Now** and nothing happens at all

This happens when the Pi's copy of the repository can no longer be updated — the
database was once tracked in git and is now modified, or the folder's ownership
has changed. The update button runs a `git pull` that quietly fails, so it can
never reach the new version. Nothing is wrong with your Pi, and nothing is lost.

Log in over SSH and run:

```bash
curl -fsSL https://github.com/aleh11/airtime/releases/latest/download/legacy-port.sh | sudo bash
```

That script does what the button would have: stops and removes the old
services, drops the nginx site and the old crontab entries, moves your database
to `/var/lib/airtime`, and installs the current release. It prints what it finds
as it goes, and it is safe to run twice.

Afterwards, the old folder in your home directory is no longer used and can be
deleted whenever you like.

## Supported Frequencies and encoding
- **DCF77** - Germany (77.5 kHz)
- **WWVB** - USA (60 kHz)
- **MSF** - UK (60 kHz)
- **JJY40** - Japan (40 kHz)
- **JJY60** - Japan (60 kHz)

## Links

- [**Official website**](https://airtime.diy/)
- [**txtempus repo**](https://github.com/hzeller/txtempus)
- [**Live Dashboard**](https://airtime.ddns.net:8443)
