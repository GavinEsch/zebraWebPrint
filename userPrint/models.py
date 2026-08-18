from django.db import models


class PrintJob(models.Model):
    STATUS_RESERVED = 'reserved'
    STATUS_SENT = 'sent'
    STATUS_FAILED = 'failed'
    STATUS_CANCELED = 'canceled'
    STATUS_CHOICES = [
        (STATUS_RESERVED, 'Reserved'),
        (STATUS_SENT, 'Sent'),
        (STATUS_FAILED, 'Failed'),
        (STATUS_CANCELED, 'Canceled'),
    ]

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_RESERVED,
        db_index=True,
    )
    printer_name = models.CharField(max_length=255, blank=True)
    label_count = models.PositiveIntegerField(default=0)
    sent_count = models.PositiveIntegerField(default=0)
    error_message = models.TextField(blank=True)
    requested_by = models.CharField(max_length=150, blank=True)
    user_agent = models.TextField(blank=True)
    browser_platform = models.CharField(max_length=255, blank=True)
    browser_language = models.CharField(max_length=64, blank=True)
    browser_vendor = models.CharField(max_length=255, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    canceled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Print job {self.id} ({self.status})'


class LPNSuffix(models.Model):
    suffix = models.CharField(max_length=6, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.suffix


class PrinterFilter(models.Model):
    allowed_ip = models.CharField(max_length=45, blank=True)
    display_name = models.CharField(max_length=255, blank=True)
    is_enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def enabled(self):
        return bool(self.is_enabled and self.allowed_ip and self.display_name)

    def __str__(self):
        if self.enabled:
            return f'{self.display_name} ({self.allowed_ip})'
        if self.display_name or self.allowed_ip:
            return f'{self.display_name or self.allowed_ip} (disabled)'
        return 'Printer entry disabled'


"""This class is used to define the LPN model."""
class LPN(models.Model):
    full_lpn = models.CharField(max_length=15, unique=True, db_index=True)
    print_job = models.ForeignKey(
        PrintJob,
        null=True,
        blank=True,
        related_name='lpns',
        on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    printed_at = models.DateTimeField(null=True, blank=True)
    
    def __str__(self):
        return self.full_lpn
