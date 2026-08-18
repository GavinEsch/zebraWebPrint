import json

from django.test import TestCase
from django.urls import reverse

from .models import LPN, LPNSuffix, PrinterFilter, PrintJob


class ReserveLPNTests(TestCase):
    def test_reserve_lpns_returns_requested_unique_lpns(self):
        response = self.client.post(
            reverse('reserve_lpns'),
            data=json.dumps({'count': 10}),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'success')
        self.assertEqual(len(data['lpns']), 10)
        self.assertEqual(len(set(data['lpns'])), 10)
        self.assertEqual(len({lpn[-6:] for lpn in data['lpns']}), 10)
        self.assertIn('job_id', data)
        self.assertEqual(LPN.objects.count(), 10)
        self.assertEqual(LPNSuffix.objects.count(), 10)
        self.assertEqual(PrintJob.objects.count(), 1)
        print_job = PrintJob.objects.get()
        self.assertEqual(print_job.status, PrintJob.STATUS_RESERVED)
        self.assertEqual(print_job.label_count, 10)
        self.assertEqual(print_job.sent_count, 0)

    def test_reserve_lpns_does_not_reuse_existing_last_six_suffix(self):
        LPN.objects.create(full_lpn='LPNAAAAAABC123')
        LPNSuffix.objects.create(suffix='ABC123')

        response = self.client.post(
            reverse('reserve_lpns'),
            data=json.dumps({'count': 50}),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        suffixes = {full_lpn[-6:] for full_lpn in response.json()['lpns']}
        self.assertNotIn('ABC123', suffixes)
        self.assertEqual(len(suffixes), 50)

    def test_reserve_lpns_rejects_oversized_batch(self):
        response = self.client.post(
            reverse('reserve_lpns'),
            data=json.dumps({'count': 1001}),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['status'], 'error')
        self.assertEqual(LPN.objects.count(), 0)
        self.assertEqual(PrintJob.objects.count(), 0)

    def test_print_job_detail_returns_lpns(self):
        reserve_response = self.client.post(
            reverse('reserve_lpns'),
            data=json.dumps({'count': 2, 'printer_name': 'Test Printer'}),
            content_type='application/json',
        )
        job_id = reserve_response.json()['job_id']

        response = self.client.get(reverse('print_job_detail', args=[job_id]))

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['job_id'], job_id)
        self.assertEqual(data['printer_name'], 'Test Printer')
        self.assertEqual(data['job_status'], PrintJob.STATUS_RESERVED)
        self.assertEqual(len(data['lpns']), 2)

    def test_print_job_status_update_records_sent_count_without_marking_lpns_printed(self):
        reserve_response = self.client.post(
            reverse('reserve_lpns'),
            data=json.dumps({'count': 2}),
            content_type='application/json',
        )
        job_id = reserve_response.json()['job_id']

        response = self.client.post(
            reverse('update_print_job_status', args=[job_id]),
            data=json.dumps({'status': PrintJob.STATUS_SENT, 'sent_count': 2}),
            content_type='application/json',
        )

        print_job = PrintJob.objects.get(id=job_id)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(print_job.status, PrintJob.STATUS_SENT)
        self.assertEqual(print_job.sent_count, 2)
        self.assertIsNotNone(print_job.completed_at)
        self.assertEqual(LPN.objects.filter(print_job_id=job_id, printed_at__isnull=False).count(), 0)

    def test_print_job_status_update_records_failure(self):
        reserve_response = self.client.post(
            reverse('reserve_lpns'),
            data=json.dumps({'count': 1}),
            content_type='application/json',
        )
        job_id = reserve_response.json()['job_id']

        response = self.client.post(
            reverse('update_print_job_status', args=[job_id]),
            data=json.dumps({'status': PrintJob.STATUS_FAILED, 'message': 'Paper Out'}),
            content_type='application/json',
        )

        print_job = PrintJob.objects.get(id=job_id)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(print_job.status, PrintJob.STATUS_FAILED)
        self.assertEqual(print_job.error_message, 'Paper Out')
        self.assertEqual(LPN.objects.filter(print_job_id=job_id, printed_at__isnull=True).count(), 1)

    def test_print_job_status_update_records_canceled_job(self):
        reserve_response = self.client.post(
            reverse('reserve_lpns'),
            data=json.dumps({'count': 10}),
            content_type='application/json',
        )
        job_id = reserve_response.json()['job_id']

        response = self.client.post(
            reverse('update_print_job_status', args=[job_id]),
            data=json.dumps({
                'status': PrintJob.STATUS_CANCELED,
                'message': 'Canceled by user from browser',
                'sent_count': 5,
            }),
            content_type='application/json',
        )

        print_job = PrintJob.objects.get(id=job_id)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(print_job.status, PrintJob.STATUS_CANCELED)
        self.assertEqual(print_job.sent_count, 5)
        self.assertEqual(print_job.error_message, 'Canceled by user from browser')
        self.assertIsNotNone(print_job.canceled_at)

    def test_allowed_printers_defaults_to_empty_list(self):
        response = self.client.get(reverse('allowed_printers'))

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'success')
        self.assertEqual(data['printers'], [])
        self.assertEqual(data['enabled_count'], 0)

    def test_allowed_printer_can_be_saved(self):
        response = self.client.post(
            reverse('save_allowed_printer'),
            data=json.dumps({
                'allowed_ip': '192.168.1.50',
                'display_name': 'Receiving Zebra',
                'is_enabled': True,
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        printer = response.json()['printer']
        self.assertTrue(printer['enabled'])
        self.assertEqual(printer['allowed_ip'], '192.168.1.50')
        self.assertEqual(printer['display_name'], 'Receiving Zebra')
        setting = PrinterFilter.objects.get()
        self.assertEqual(setting.allowed_ip, '192.168.1.50')
        self.assertEqual(setting.display_name, 'Receiving Zebra')
        self.assertTrue(setting.is_enabled)

    def test_allowed_printer_rejects_invalid_ip(self):
        response = self.client.post(
            reverse('save_allowed_printer'),
            data=json.dumps({
                'allowed_ip': 'not an ip',
                'display_name': 'Receiving Zebra',
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['status'], 'error')
        self.assertEqual(PrinterFilter.objects.count(), 0)

    def test_allowed_printer_can_be_disabled(self):
        setting = PrinterFilter.objects.create(
            allowed_ip='192.168.1.50',
            display_name='Receiving Zebra',
        )

        response = self.client.post(
            reverse('save_allowed_printer'),
            data=json.dumps({
                'id': setting.id,
                'allowed_ip': '192.168.1.50',
                'display_name': 'Receiving Zebra',
                'is_enabled': False,
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        printer = response.json()['printer']
        self.assertFalse(printer['enabled'])
        setting.refresh_from_db()
        self.assertFalse(setting.is_enabled)

    def test_allowed_printers_returns_multiple_entries(self):
        PrinterFilter.objects.create(
            allowed_ip='192.168.1.50',
            display_name='Receiving Zebra',
            is_enabled=True,
        )
        PrinterFilter.objects.create(
            allowed_ip='192.168.1.51',
            display_name='Shipping Zebra',
            is_enabled=False,
        )

        response = self.client.get(reverse('allowed_printers'))

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data['printers']), 2)
        self.assertEqual(data['enabled_count'], 1)

    def test_allowed_printer_can_be_deleted(self):
        setting = PrinterFilter.objects.create(
            allowed_ip='192.168.1.50',
            display_name='Receiving Zebra',
        )

        response = self.client.post(reverse('delete_allowed_printer', args=[setting.id]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'success')
        self.assertEqual(PrinterFilter.objects.count(), 0)
