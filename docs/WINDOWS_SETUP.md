# Running the HRIS on Windows

These steps get the app running on your Windows PC with its own **local** database.
You never connect to the real (production) database. Everything stays on your machine.

Plan for about 30 minutes the first time, mostly downloads.

---

## Step 1 — Install the tools (one time only)

Install these three programs. Accept the default options in each installer.

1. **Git**: https://git-scm.com/download/win
2. **Node.js 22 LTS**: https://nodejs.org. Pick the **22.x** version.
3. **Docker Desktop**: https://www.docker.com/products/docker-desktop
   - If the installer asks, leave **"Use WSL 2"** checked.
   - Restart your PC when it tells you to.
   - Open Docker Desktop once and wait until it says **"Engine running"**.

To confirm, open **PowerShell** (Start menu → type `PowerShell`) and run:

```powershell
git --version
node --version     # should start with v22
docker --version
```

If all three print a version number, you're ready.

---

## Step 2 — Get the code

In PowerShell:

```powershell
cd $HOME\Documents
git clone https://github.com/<your-username>/<your-fork>.git hris
cd hris
npm install
```

Use the URL of **your fork**, not the original repo.

> Keep the project **out of OneDrive** (for example, not in a OneDrive-synced
> Documents folder). OneDrive syncing makes `npm install` and the app very slow.
> `C:\dev\hris` is a safe choice.

---

## Step 3 — Start the local database

Make sure **Docker Desktop is open and running**, then:

```powershell
npm run db:start
npm run db:reset
```

- `db:start` downloads the database images. The **first time takes several minutes**.
- `db:reset` builds all the tables and adds sample data and login accounts.

When it finishes you should see `Finished supabase db reset`.

---

## Step 4 — Create your settings file

```powershell
copy .env.example .env.development.local
npx supabase status
```

`supabase status` prints a list of values. Find **`ANON_KEY`** and
**`SERVICE_ROLE_KEY`** and copy them.

Open the settings file in Notepad:

```powershell
notepad .env.development.local
```

Paste the two keys after the `=` signs, so it looks like this:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...(the ANON_KEY you copied)
NEXT_PUBLIC_SERVICE_ROLE_KEY=eyJhbGci...(the SERVICE_ROLE_KEY you copied)
DEV_LOGIN_PASSWORD=localdev
```

Save and close Notepad.

---

## Step 5 — Run the app

```powershell
npm run dev
```

Wait until it says **Ready**, then open this in your browser:

### 👉 http://localhost:3000/api/auth/dev-login

Click an account to sign in as that user:

| Account               | What it can do      |
| --------------------- | ------------------- |
| `admin@lgu.gov.ph`    | Everything (super admin) |
| `hr@lgu.gov.ph`       | HR admin            |
| `depthead@lgu.gov.ph` | Department head     |
| `employee@lgu.gov.ph` | Regular employee    |

(The **Sign in with Google** button doesn't work locally. Always use the link above.)

---

## Every day after that

1. Open **Docker Desktop** and wait for "Engine running".
2. In PowerShell, from the project folder:

   ```powershell
   npm run db:start
   npm run dev
   ```

3. Go to http://localhost:3000/api/auth/dev-login

When you're done, press `Ctrl + C` in PowerShell to stop the app, then run
`npm run db:stop`.

**Messed up your local data?** Run `npm run db:reset` to start fresh. It only
affects your own PC.

---

## If something goes wrong

**"running scripts is disabled on this system"** when running `npm`.
Run this once, then reopen PowerShell:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**`db:start` says Docker isn't running / "cannot connect to the Docker daemon".**
Open Docker Desktop and wait for "Engine running", then try again.

**"port is already allocated" or "access permissions" on port 54421 / 54422.**
Windows sometimes reserves these ports. Open PowerShell **as Administrator**
(right-click → Run as administrator) and run:

```powershell
net stop winnat
net start winnat
```

Then run `npm run db:start` again.

**The dev-login page shows "Not found".**
Check `.env.development.local`: the URL must be `http://127.0.0.1:54421` and
`DEV_LOGIN_PASSWORD=localdev` must be there. Stop the app (`Ctrl + C`) and run
`npm run dev` again. The app only reads this file when it starts.

**"Invalid login credentials" when clicking an account.**
Run `npm run db:reset` to recreate the login accounts.

**The page loads but shows no data.**
That's expected at first. The local database only has a few sample employees. Sign
in as `admin@lgu.gov.ph` to add more.

**Still stuck?** Copy the full error message from PowerShell and send it to the
team lead.

---

## Running the tests (optional)

With the database running:

```powershell
npm test
```

You should see `fail 0` at the end of each section. A few tests show as
**skipped**. That's normal: they need private data files that aren't in the repo.
