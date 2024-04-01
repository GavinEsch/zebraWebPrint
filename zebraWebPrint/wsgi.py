import os
import sys
from django.core.wsgi import get_wsgi_application
from pathlib import Path

# Add project directory to the sys.path
path_home = str(Path(__file__).parents[1])
if path_home not in sys.path:
    sys.path.append(path_home)

# Set the DJANGO_SETTINGS_MODULE environment variable to the settings.py file of this project
os.environ['DJANGO_SETTINGS_MODULE'] = 'zebraWebPrint.settings'

application = get_wsgi_application()