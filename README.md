# zebraWebPrint

Local test setup:

```powershell
.\.venv\Scripts\Activate.ps1
$env:DJANGO_DEBUG='true'
$env:DATABASE_ENGINE='sqlite'
python manage.py migrate
python manage.py runserver
```

Run tests:

```powershell
$env:DATABASE_ENGINE='sqlite'
python manage.py test userPrint
```

PostgreSQL is the default database engine. Use these environment variables when testing against PostgreSQL:

```powershell
$env:DJANGO_SECRET_KEY='replace-with-a-production-secret'
$env:DJANGO_DEBUG='false'
$env:DJANGO_ALLOWED_HOSTS='www.GRL-ZebraPrint.com,GRL-ZebraPrint.com'
$env:POSTGRES_DB='zebra_web_print'
$env:POSTGRES_USER='zebra_web_print'
$env:POSTGRES_PASSWORD='your_password'
$env:POSTGRES_HOST='localhost'
$env:POSTGRES_PORT='5432'
python manage.py migrate
```

Generated files such as `db.sqlite3`, `__pycache__/`, and `staticfiles/` are ignored. Run `python manage.py collectstatic` when deploying static files.

The browser reserves LPNs in one server-side batch, receives a print job id, sends ZPL to Zebra BrowserPrint in small chunks, then reports `sent`, `failed`, or `canceled` status with the number of labels sent.
