# Run as a systemd service

`orchestrator.service` runs the deployable entry point, `dist/run.js`, as a
long-running poller under systemd. It is a **user** unit: the service needs the
operator's home for `gh`'s stored auth, the default `~/workspace` clone store,
and the `openspec` CLI under `~/.local/bin`, so a user service keeps all of that
without root.

Prerequisites, per [Deploy](../README.md#deploy):

- Node.js 24+ and a built tree (`npm ci && npm run build`) so `dist/run.js` and
  `dist/index.js` are current.
- `git`, `gh`, and `openspec` on `PATH`; `docker` too when any repository
  configures an `environment`.
- Credentials in an environment file and a `config.yaml` in the checkout
  (`config*.yaml` is git-ignored, so start from `examples/config.yaml`).

## Install

```bash
# 1. Build the deployable entry point.
cd ~/orchestrator
npm ci
npm run build

# 2. Create the configuration, then edit the repositories and agent.model.
cp examples/config.yaml config.yaml

# 3. Provide credentials out of band; never edit them into the unit.
mkdir -p ~/.config/orchestrator
cp deploy/orchestrator.env.example ~/.config/orchestrator/orchestrator.env
chmod 700 ~/.config/orchestrator
chmod 600 ~/.config/orchestrator/orchestrator.env
$EDITOR ~/.config/orchestrator/orchestrator.env

# 4. Install the unit and start it.
mkdir -p ~/.config/systemd/user
cp deploy/orchestrator.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now orchestrator.service
```

The unit assumes the checkout is at `~/orchestrator` and the config at
`~/orchestrator/config.yaml`. Edit `WorkingDirectory` and `ExecStart` in the unit
if they live elsewhere.

To keep the service running when you are not logged in, enable lingering:

```bash
sudo loginctl enable-linger "$USER"
```

## Operate

```bash
systemctl --user status orchestrator.service
journalctl --user -u orchestrator.service -f          # follow the log
journalctl --user -u orchestrator.service --since today
systemctl --user restart orchestrator.service          # pick up a config change
systemctl --user stop orchestrator.service
```

Every poll cycle with activity, and every turn with `logging.verbose: true` (or
`--verbose`), is written to the journal. `LLM_API_KEY` and other secrets are
redacted, so they never appear there.

A restart is safe: on start the orchestrator re-discovers in-flight workflows
from their lifecycle labels and resumes without duplicating turns. Label an
issue `openspec` to start a workflow.

## Run once instead of polling

For a one-shot poll (a timer, a CI job) override the command and let the unit
exit:

```bash
systemctl --user edit orchestrator.service
```

```ini
[Service]
Type=oneshot
Restart=no
ExecStart=
ExecStart=/usr/bin/node %h/orchestrator/dist/run.js --config %h/orchestrator/config.yaml --once
```

Pair that with `orchestrator.timer` if you want systemd to schedule the sweep
rather than the built-in poll loop. `pollIntervalSeconds` in `config.yaml` is
ignored under `--once`.

## System-wide variant

To run it as a system service (for example under a dedicated `orchestrator`
account), install it to `/etc/systemd/system/`, add `User=`/`Group=`, and make
the paths absolute rather than home-relative, because a system unit does not
inherit `HOME`:

```ini
[Service]
User=orchestrator
Group=orchestrator
WorkingDirectory=/opt/orchestrator
Environment=HOME=/home/orchestrator
Environment=PATH=/home/orchestrator/.local/bin:/usr/local/bin:/usr/bin:/bin
EnvironmentFile=-/etc/orchestrator/orchestrator.env
ExecStart=/usr/bin/node /opt/orchestrator/dist/run.js --config /opt/orchestrator/config.yaml
```

Replace `WantedBy=default.target` with `WantedBy=multi-user.target`, change
`systemctl --user` to `systemctl`, and give that account its own `gh` login (or
a `GITHUB_TOKEN` in the environment file), a home for `~/workspace`, and
membership in the `docker` group when containerized turns are used.
