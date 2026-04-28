from django.contrib import admin
from .models import LPN, LPNSuffix, PrintJob

"""This file is used to register the LPN model with the Django admin site."""


@admin.register(LPN)
class LPNAdmin(admin.ModelAdmin):
    list_display = ('full_lpn', 'print_job', 'created_at', 'printed_at')
    list_filter = ('created_at', 'printed_at')
    search_fields = ('full_lpn',)
    readonly_fields = ('created_at', 'printed_at')


@admin.register(PrintJob)
class PrintJobAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'status',
        'sent_count',
        'label_count',
        'lpn_count',
        'printer_name',
        'requested_by',
        'created_at',
        'completed_at',
        'canceled_at',
    )
    list_filter = (
        'status',
        'printer_name',
        'requested_by',
        'created_at',
        'completed_at',
        'canceled_at',
    )
    search_fields = ('id', 'printer_name', 'lpns__full_lpn')
    readonly_fields = (
        'status',
        'label_count',
        'sent_count',
        'error_message',
        'printer_name',
        'requested_by',
        'user_agent',
        'browser_platform',
        'browser_language',
        'browser_vendor',
        'created_at',
        'updated_at',
        'completed_at',
        'canceled_at',
        'lpn_count',
    )
    fieldsets = (
        (None, {
            'fields': (
                'status',
                'label_count',
                'sent_count',
                'lpn_count',
                'error_message',
            ),
        }),
        ('Printer', {
            'fields': ('printer_name',),
        }),
        ('Audit', {
            'fields': (
                'requested_by',
                'user_agent',
                'browser_platform',
                'browser_language',
                'browser_vendor',
            ),
        }),
        ('Timestamps', {
            'fields': (
                'created_at',
                'updated_at',
                'completed_at',
                'canceled_at',
            ),
        }),
    )

    def lpn_count(self, obj):
        return obj.lpns.count()

    lpn_count.short_description = 'Reserved LPNs'


@admin.register(LPNSuffix)
class LPNSuffixAdmin(admin.ModelAdmin):
    list_display = ('suffix', 'created_at')
    search_fields = ('suffix',)
    readonly_fields = ('suffix', 'created_at')
