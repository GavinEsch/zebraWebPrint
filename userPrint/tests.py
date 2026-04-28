import json

from django.test import TestCase
from django.urls import reverse

from .models import LPN, PrintJob


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
        self.assertIn('job_id', data)
        self.assertEqual(LPN.objects.count(), 10)
        self.assertEqual(PrintJob.objects.count(), 1)
        print_job = PrintJob.objects.get()
        self.assertEqual(print_job.status, PrintJob.STATUS_RESERVED)
        self.assertEqual(print_job.label_count, 10)
        self.assertEqual(print_job.sent_count, 0)

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
