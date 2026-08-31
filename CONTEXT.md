# AirTime

AirTime is a Raspberry Pi appliance that transmits radio time signals to nearby radio-controlled clocks and watches, and a dashboard for controlling it.

## Language

**Signal Standard**:
One of the five time-signal encodings AirTime can transmit — DCF77, WWVB, MSF, JJY40, JJY60. Each implies a carrier frequency and a bit encoding.
_Avoid_: Service, mode, frequency

> The database stores this under `radio_config.default_service` and the status
> table uses `services` for systemd units. "Service" therefore means two
> unrelated things in the existing schema. New code says Signal Standard for the
> encoding and Unit for anything systemd.

**Broadcast**:
A single run of the transmitter, started manually or by a Schedule, lasting for a set duration.
_Avoid_: Transmission, session, job

**Schedule**:
A recurring rule that starts a Broadcast at a given time. Owned by the daemon and stored in SQLite.
_Avoid_: Cron job, task, timer

**Offset**:
A signed number of minutes added to real time before encoding, so a clock can be driven to a time other than the Pi's own.
_Avoid_: Drift, skew, adjustment

**Time Mode**:
Whether a Broadcast encodes the current time plus any Offset (`time_now`), or a fixed wall-clock time the user typed (`fixed_time`).

**Release Channel**:
Which releases an install is offered — `stable` ignores prereleases, `beta`
takes the newest release of any kind. Stored per install, changed from the
dashboard.
_Avoid_: Branch, experimental mode, track

**Stealth Mode**:
A setting that suppresses the hardware LEDs while leaving transmission behaviour unchanged.

**Antenna**:
The ferrite-core or hand-wound air-coil aerial driven by the transmitter, and by extension the LED reporting whether it is active.
