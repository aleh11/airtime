# Missed schedules only catch up within ten minutes

The daemon fires schedules by comparing the current time against the last time
it checked, which means any gap between the two reads as downtime to catch up
on. A Raspberry Pi has no real-time clock, so it boots with a stale time and
jumps forward when chrony syncs — on hardware this was observed firing all five
of a user's schedules at once, seconds after every reboot. Catch-up is now
bounded to ten minutes, and a clock that moves backwards never triggers it.

## Consequences

- A broadcast missed because the Pi was switched off overnight will not fire
  late the next day. This is the intended behaviour: a time signal is only
  useful when it is transmitted at the time it was scheduled for.
- Catch-up still covers what it was meant for — a daemon restarted by an update
  a few seconds before one of its schedules was due.
