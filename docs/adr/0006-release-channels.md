# Beta builds are a release channel, not a branch to switch to

The dashboard used to offer an "experimental features" switch that ran `git
checkout experimental` on the user's clone and restarted the services. There is
no clone to check out any more, so the same intent is now expressed as a channel
an install opts into: stable asks GitHub for `/releases/latest`, which excludes
prereleases by definition, and beta asks for the full release list. Every push
to `experimental` publishes `v<VERSION base>-beta.<run number>` as a prerelease,
so the beta channel tracks development continuously rather than waiting for
someone to cut a release candidate by hand.

The guard that keeps beta builds away from stable installs is GitHub's own
prerelease flag rather than anything we wrote: a prerelease is not served by
`releases/latest/download`, so a stable install cannot reach one even if the
daemon asked for it by name.

Releases are ranked by semantic version precedence, not by publication date.
GitHub returns them newest-first, so a hotfix cut from master appears above a
beta it ranks below, and taking the first entry would have offered a beta
install a downgrade. The same comparison decides whether an update exists at
all, rather than testing that the tags merely differ.

## Consequences

- An install that switches back to stable while running a beta stays on that
  beta until a stable release is genuinely newer. It is never downgraded, and it
  is never offered a downgrade dressed up as an update.
- `VERSION` on `experimental` names the release being worked towards rather than
  one that exists. The release workflow refuses to publish a plain version from
  anywhere but master, so the branch decides what a version number means.
- Every push to `experimental` publishes a release. That is cheap on a public
  repository, where Actions minutes on standard runners are free, but it does
  accumulate prereleases that nothing prunes.
- The daemon writes the tag it resolved into the update request and the helper
  installs exactly that tag, so an install gets the build the dashboard offered
  rather than whatever `latest` means by the time the helper runs.
