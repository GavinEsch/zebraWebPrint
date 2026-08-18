from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('userPrint', '0005_lpnsuffix'),
    ]

    operations = [
        migrations.CreateModel(
            name='PrinterFilter',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('allowed_ip', models.CharField(blank=True, max_length=45)),
                ('display_name', models.CharField(blank=True, max_length=255)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
        ),
    ]
