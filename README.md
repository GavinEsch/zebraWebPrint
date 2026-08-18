# zebraWebPrint

`zebraWebPrint` is a Django app for generating unique LPN labels and sending ZPL to Zebra printers through Zebra Browser Print.

The Django server owns the data: LPN generation, duplicate checks, print-job records, job status, and audit metadata. The browser owns the printer connection because Zebra Browser Print exposes printers from the user's workstation.

## Features

- Reserve unique LPNs server-side before printing.
- Enforce full LPN uniqueness.
- Enforce unique last-six-character suffixes for future reservations.
- Print ZPL labels through Zebra Browser Print.
- Support multiple printers per workstation through a printer dropdown.
- Send large batches in small chunks so a user can stop sending the remaining labels.
- Send Zebra `~JA` when Stop Printer is clicked to clear buffered labels when possible.
- Record print jobs with status, requested count, sent count, printer name, timestamps, browser metadata, and errors.
- Admin view for LPNs, suffix reservations, and print jobs.
- Light/dark theme toggle.

## Architecture

Printing is client-driven:

1. The browser asks Django to reserve a batch of LPNs.
2. Django generates unique values, reserves their last-six suffixes, creates a `PrintJob`, and returns the LPNs.
3. The browser converts each LPN to ZPL.
4. Zebra Browser Print sends ZPL from that workstation to the selected printer.
5. The browser reports `sent`, `failed`, or `canceled` status back to Django.

Django does not directly talk to printers. Each user must have Zebra Browser Print installed and running on their workstation.

## Requirements

- Python 3.12 recommended.
- Django 5.0.x.
- Zebra Browser Print installed on each printing workstation.
- Zebra printer that supports ZPL.
- SQLite for local testing or PostgreSQL for shared/production use.

Install Python dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## Local Setup With SQLite

SQLite is easiest for local development. The project defaults to PostgreSQL unless `DATABASE_ENGINE=sqlite` is set.

```powershell
.\.venv\Scripts\Activate.ps1
$env:DJANGO_DEBUG='true'
$env:DATABASE_ENGINE='sqlite'
python manage.py migrate
python manage.py runserver
```

Open:

```text
http://127.0.0.1:8000/
```

Admin:

```text
http://127.0.0.1:8000/admin/
```

Create an admin user if needed:

```powershell
$env:DATABASE_ENGINE='sqlite'
python manage.py createsuperuser
```

## Docker Setup On Windows 10 With PostgreSQL

This is the easiest way to run the web app on a Windows 10 box for other users on the network.

Install Docker Desktop, then from the project folder:

```powershell
copy .env.example .env
notepad .env
docker compose up --build -d
```

Before starting it for real, edit `.env` and change:

```env
DJANGO_SECRET_KEY=replace-this-with-a-long-random-secret
POSTGRES_PASSWORD=change-me
```

The container will:

- install Python dependencies
- start a PostgreSQL database container
- store PostgreSQL data in the Docker volume `postgres_data`
- run database migrations
- collect static files
- start Gunicorn on port `8000`

Open locally on the Windows 10 host:

```text
http://localhost:8000/
```

Open from another computer on the network:

```text
http://WINDOWS-BOX-IP:8000/
```

Example:

```text
http://192.168.1.50:8000/
```

If other computers cannot connect, check Windows Firewall and allow inbound TCP traffic on port `8000`.

Useful Docker commands:

```powershell
docker compose ps
docker compose logs -f
docker compose restart
docker compose down
```

Create an admin user inside the container:

```powershell
docker compose exec web python manage.py createsuperuser
```

Apply migrations manually if needed:

```powershell
docker compose exec web python manage.py migrate
```

Back up the PostgreSQL data before replacing the machine or deleting Docker volumes. The database lives in the named Docker volume:

```powershell
docker volume ls
```

Important printing note: Docker only hosts the Django webpage. Zebra Browser Print still runs on the user's workstation/browser. Each user who prints needs Zebra Browser Print installed and needs access to the Zebra printer they want to use.

### Optional Docker SQLite Mode

PostgreSQL is recommended. If you still want the one-container SQLite mode for a quick test, set this in `.env`:

```env
DATABASE_ENGINE=sqlite
SQLITE_PATH=/app/data/db.sqlite3
```

Then start:

```powershell
docker compose up --build -d
```

If you already have a local `db.sqlite3` and want Docker SQLite mode to use that same data:

```powershell
mkdir data
copy db.sqlite3 data\db.sqlite3
docker compose up --build -d
```

## Production/PostgreSQL Setup

PostgreSQL is the default database engine. Set these variables before running migrations or the app:

```powershell
$env:DJANGO_SECRET_KEY='replace-with-a-production-secret'
$env:DJANGO_DEBUG='false'
$env:DJANGO_ALLOWED_HOSTS='www.grlprint.com,grlprint.com'
$env:POSTGRES_DB='zebra_web_print'
$env:POSTGRES_USER='zebra_web_print'
$env:POSTGRES_PASSWORD='your_password'
$env:POSTGRES_HOST='localhost'
$env:POSTGRES_PORT='5432'
python manage.py migrate
```

Optional:

```powershell
$env:POSTGRES_CONN_MAX_AGE='60'
```

## Environment Variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | Django signing/crypto secret | dev-only fallback |
| `DJANGO_DEBUG` | Enables debug mode when true | `true` |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated hostnames | `localhost,127.0.0.1` |
| `DATABASE_ENGINE` | Set to `sqlite` for local SQLite, otherwise PostgreSQL | PostgreSQL |
| `SQLITE_PATH` | SQLite database path, useful in Docker | `db.sqlite3` in project root |
| `WEB_PORT` | Host port used by Docker Compose | `8000` |
| `POSTGRES_DB` | PostgreSQL database name | `zebra_web_print` |
| `POSTGRES_USER` | PostgreSQL username | `zebra_web_print` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `change-me` in Docker example |
| `POSTGRES_HOST` | PostgreSQL host | `db` in Docker, `localhost` outside Docker |
| `POSTGRES_PORT` | PostgreSQL port | `5432` |
| `POSTGRES_CONN_MAX_AGE` | Django persistent DB connection age | `60` |

## Running Tests

```powershell
$env:DATABASE_ENGINE='sqlite'
python manage.py test userPrint
```

Useful checks:

```powershell
$env:DATABASE_ENGINE='sqlite'
python manage.py check
python manage.py makemigrations --check --dry-run
node --check userPrint/static/userPrint/GRLBrowserPrint.js
node --check userPrint/static/userPrint/theme.js
```

## Static Files

Source static files live in:

```text
userPrint/static/userPrint/
```

Generated static output lives in:

```text
staticfiles/
```

`staticfiles/` is ignored by git. For deployment:

```powershell
python manage.py collectstatic
```

## Database Notes

`db.sqlite3` is ignored by git. It may exist locally and continue updating, but git will show it as removed from tracking if it was previously committed.

Current important models:

- `LPN`: full LPN value, job relation, timestamps.
- `LPNSuffix`: unique last-six suffix reservations.
- `PrintJob`: status, counts, printer, audit metadata, timestamps, and errors.

The last-six uniqueness rule is enforced for new reservations through `LPNSuffix`. Historical data may contain duplicate suffixes if those labels existed before the rule was added.

## Printing Behavior

Batch printing:

- The browser reserves all labels in one request.
- The browser sends labels to Zebra Browser Print in chunks of 5.
- Stop Printer stops sending remaining chunks and sends Zebra `~JA`.
- A few labels may still print if they were already sent to the printer buffer.

Status values:

- `reserved`: LPNs have been reserved but not fully sent.
- `sent`: Browser Print accepted all chunks from the browser.
- `failed`: a printer/browser/server error occurred.
- `canceled`: the user clicked Stop Printer.

`sent_count` means the browser successfully handed that many labels to Zebra Browser Print. It is not perfect physical proof that every label came out of the printer.

## Zebra Browser Print Workstation Setup

On each workstation:

1. Install Zebra Browser Print.
2. Make sure Zebra Browser Print is running.
3. Install/configure the Zebra printer in the OS or Zebra tools.
4. Open the Django app in the browser.
5. Select the desired printer from the dropdown.

If no printers appear, check:

- Zebra Browser Print is running.
- The printer is connected and installed.
- The browser can reach the local Browser Print service.
- The printer supports ZPL.

## Common Commands

Run locally:

```powershell
$env:DATABASE_ENGINE='sqlite'
python manage.py runserver
```

Apply migrations:

```powershell
$env:DATABASE_ENGINE='sqlite'
python manage.py migrate
```

Create admin user:

```powershell
$env:DATABASE_ENGINE='sqlite'
python manage.py createsuperuser
```

Collect static:

```powershell
python manage.py collectstatic
```

## Operational Caveats

- This app does not centrally lock printers. Two users can choose the same physical printer.
- Stop Printer is best-effort. It prevents more chunks from being sent and sends `~JA`, but labels already buffered may still print.
- Browser-reported status is not the same as a hardware-verified print completion event.
- If running without `DATABASE_ENGINE=sqlite`, the app uses PostgreSQL.
- If the admin/custom print page should be restricted, add staff/login protection in Django views.

## Project Layout

```text
manage.py
zebraWebPrint/
  settings.py
  urls.py
userPrint/
  admin.py
  models.py
  urls.py
  views.py
  migrations/
  static/userPrint/
    GRLBrowserPrint.js
    theme.js
    app.css
  templates/userPrint/
    printPage.html
    adminPrintPage.html
```
