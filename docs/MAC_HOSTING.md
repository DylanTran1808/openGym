# Running this fork on a Mac (gettingprime)

How this personal fork runs: on a Mac with **OrbStack** (Docker), published over HTTPS with
**Tailscale Funnel**, and used on an iPhone as an installed web app.

## One-time setup
1. **OrbStack:** `brew install --cask orbstack`. Open it once, choose Docker, and turn on
   *Start at login*.
2. **Tailscale:** install it and sign in. In the admin console
   (<https://login.tailscale.com/admin/dns>), turn on **MagicDNS** and **HTTPS Certificates**.
   Funnel is enabled the first time `./gp.sh start` runs: Tailscale prints a link, you approve
   it, and then you run `./gp.sh start` again.
3. **`.env`** (gitignored; copy it from `.env.example`):
   ```bash
   RP_ID=<mac>.<tailnet>.ts.net
   ORIGIN=https://<mac>.<tailnet>.ts.net
   WEB_PORT=8080
   VAPID_SUBJECT=https://<mac>.<tailnet>.ts.net
   ALLOW_GUEST=0
   FIRST_USER_ADMIN=1
   INVITE_ONLY=0
   ```
   `RP_ID`/`ORIGIN` must be the exact Funnel hostname. Passkeys are tied to it, and the API
   refuses state-changing requests from any other origin. Don't change it once you've
   registered.
4. **First profile, then lock it down.** Funnel makes the app public. Register your own profile
   right away (it becomes the admin), then run `./gp.sh lock`, which sets `INVITE_ONLY=1`.
   After that nobody else can sign up.

## Every day
| Command | What it does |
|---|---|
| `./gp.sh start` | Back up `./data`, build and start the containers, make sure Funnel is on, keep the Mac awake |
| `./gp.sh stop` | Stop the containers and let the Mac sleep again. Data stays in `./data` |
| `./gp.sh status` | Containers, Funnel, and whether the Mac is being kept awake |
| `./gp.sh logs` | Follow the API log |

- **Data:** `./data` (gitignored) holds everything: users, passkeys, your state, the session
  secret and the push keys. The API writes each change to disk immediately, so stopping loses
  nothing.
- **Backups:** each start copies `./data` to
  `~/Library/Application Support/GettingPrime/backups/<date_time>/` and keeps the last 14.
  - To restore: `./gp.sh stop`, replace `./data` with a backup folder, `./gp.sh start`.
- **After changing code:** `./gp.sh start` rebuilds (unchanged layers are cached).

## iPhone
Open the `https://….ts.net` URL in Safari → Share → **Add to Home Screen**, then open it from the
icon. Sign in with your passkey. Notifications can only be turned on from the Home Screen app
(iOS 16.4+): Settings → Notifications.

## When the Mac is off or asleep
- The Home Screen app still opens and you can still log: the service worker caches the app, and
  your data lives on the phone. Changes sync once the Mac is back.
- Push notifications and barcode lookups for products you haven't saved wait until it's back.
- Missed protein reminders catch up once when the server starts (the latest one only, never
  after 22:00).
- OrbStack's *Start at login* plus `restart: unless-stopped` bring everything back after a
  reboot. Funnel stays on.
- **Staying awake:** `./gp.sh start` runs `caffeinate -s`, which stops the Mac from sleeping
  while it's on power (check with `./gp.sh status`).
  - On battery it sleeps as usual.
  - Closing the lid always sleeps it, unless an external display, keyboard and power are
    attached. Leave the lid open when others rely on the server.
  - After a reboot, run `./gp.sh start` once to switch keeping-awake back on.

## Inviting a friend
Accounts, invites and separate data per person are built in. Each person gets their own foods,
meals, targets and reminders.
1. **On your phone:** Settings → Account → **Admin dashboard** → *Invite codes* → **New code**.
   The code is copied for you.
2. **Send your friend** the address `https://dylans-macbook-pro.tail944a9c.ts.net` and the code.
   Each code works once.
3. **Your friend** opens the address, chooses **Create new profile**, enters a name and the invite code, and
   taps **Create passkey**.
   - iPhone: Safari → Share → **Add to Home Screen**, then open it from the icon.
   - Android: Chrome → ⋮ → **Install app**.
4. **In the app:**
   - Turn on notifications in Settings → Reminders. On an iPhone this only works in the Home
     Screen app.
   - Tap **Set up your targets** on the Food card: sex, birth year, height, weight, activity and
     goal (a negative deficit means a surplus, to gain).
   - The protein reminder (⚙ on the Food card) goes off at *their* times, on their phone's clock,
     in Vietnam too.
5. **Tell them plainly about privacy:**
   - Their data is stored on your Mac, in `./data`, as plain files. You, as the host, could read
     them, and they're included in your backups.
   - Photos sent for an AI estimate go to the configured AI provider and aren't stored.
6. **To remove someone:** Admin dashboard → their profile → *Delete*. That removes their data;
   copies in older backups remain until the backups rotate out (14 starts).
- **Their reminders depend on your Mac being on.** 14:00 and 19:30 in Vietnam is 08:00–09:00 and
  13:30–14:30 in the Netherlands. If the Mac was off, the latest missed reminder is sent once when
  it starts again, before 22:00 their time.
