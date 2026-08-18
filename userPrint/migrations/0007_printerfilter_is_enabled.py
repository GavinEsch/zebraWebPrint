from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('userPrint', '0006_printerfilter'),
    ]

    operations = [
        migrations.AddField(
            model_name='printerfilter',
            name='is_enabled',
            field=models.BooleanField(default=True),
        ),
    ]
