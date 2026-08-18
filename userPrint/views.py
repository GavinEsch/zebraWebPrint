import json
import secrets
import string
from ipaddress import ip_address

from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from .models import LPN, LPNSuffix, PrinterFilter, PrintJob

LPN_PREFIX = 'LPN'
LPN_RANDOM_LENGTH = 11
LPN_SUFFIX_LENGTH = 6
MAX_BATCH_SIZE = 1000
LPN_ALPHABET = string.ascii_uppercase + string.digits

"""This function is used to display the print page. It is called when the user clicks the 'Print' button on the home page."""
def print(request):
    return render(request, 'userPrint/printPage.html')

"""This function is used to display the admin print page. It is called when the user clicks the 'Admin Print' button on the print page."""
def adminPrint(request):
    return render(request, 'userPrint/adminPrintPage.html')


def printerManagement(request):
    return render(request, 'userPrint/printerManagementPage.html')


@require_POST
def reserve_lpns(request):
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON'}, status=400)

    try:
        count = int(data.get('count'))
    except (TypeError, ValueError):
        return JsonResponse({'status': 'error', 'message': 'Invalid count'}, status=400)

    if count < 1 or count > MAX_BATCH_SIZE:
        return JsonResponse(
            {'status': 'error', 'message': f'Count must be between 1 and {MAX_BATCH_SIZE}'},
            status=400,
        )

    printer_name = normalize_printer_name(data.get('printer_name'))
    client_context = normalize_client_context(data.get('client_context'))

    try:
        print_job, lpns = reserve_print_job(
            count=count,
            printer_name=printer_name,
            requested_by=get_requested_by(request),
            user_agent=request.META.get('HTTP_USER_AGENT', '')[:2000],
            client_context=client_context,
        )
    except RuntimeError as error:
        return JsonResponse({'status': 'error', 'message': str(error)}, status=503)

    return JsonResponse({'status': 'success', 'job_id': print_job.id, 'lpns': lpns})


@require_GET
def print_job_detail(request, job_id):
    print_job = get_object_or_404(PrintJob.objects.prefetch_related('lpns'), pk=job_id)
    return JsonResponse(serialize_print_job(print_job))


@require_POST
def update_print_job_status(request, job_id):
    print_job = get_object_or_404(PrintJob, pk=job_id)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON'}, status=400)

    new_status = data.get('status')
    if new_status not in {PrintJob.STATUS_SENT, PrintJob.STATUS_FAILED, PrintJob.STATUS_CANCELED}:
        return JsonResponse({'status': 'error', 'message': 'Invalid status'}, status=400)

    sent_count = normalize_sent_count(data.get('sent_count'), print_job.label_count)
    now = timezone.now()

    print_job.status = new_status
    print_job.error_message = str(data.get('message') or '')[:2000]
    print_job.sent_count = sent_count

    printer_name = normalize_printer_name(data.get('printer_name'))
    if printer_name:
        print_job.printer_name = printer_name

    client_context = normalize_client_context(data.get('client_context'))
    update_print_job_client_context(print_job, client_context)

    if new_status == PrintJob.STATUS_SENT:
        print_job.completed_at = now
        print_job.canceled_at = None
        if print_job.sent_count == 0:
            print_job.sent_count = print_job.label_count
    elif new_status == PrintJob.STATUS_CANCELED:
        print_job.canceled_at = now

    with transaction.atomic():
        print_job.save(update_fields=[
            'status',
            'error_message',
            'printer_name',
            'sent_count',
            'browser_platform',
            'browser_language',
            'browser_vendor',
            'completed_at',
            'canceled_at',
            'updated_at',
        ])

    return JsonResponse(serialize_print_job(print_job))


@require_GET
def printer_filter(request):
    return allowed_printers(request)


@require_POST
def update_printer_filter(request):
    return save_allowed_printer(request)


@require_GET
def allowed_printers(request):
    printers = PrinterFilter.objects.exclude(
        allowed_ip='',
        display_name='',
    ).order_by('display_name', 'allowed_ip', 'id')
    serialized = [serialize_printer_filter(printer) for printer in printers]
    return JsonResponse({
        'status': 'success',
        'printers': serialized,
        'enabled_count': sum(1 for printer in serialized if printer['enabled']),
    })


@require_POST
def save_allowed_printer(request):
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON'}, status=400)

    allowed_ip = normalize_printer_ip(data.get('allowed_ip') or data.get('ip'))
    display_name = normalize_printer_name(data.get('display_name') or data.get('name'))
    is_enabled = normalize_bool(data.get('is_enabled'), default=True)

    if not allowed_ip:
        return JsonResponse({'status': 'error', 'message': 'Printer IP is required'}, status=400)
    if not display_name:
        return JsonResponse({'status': 'error', 'message': 'Printer name is required'}, status=400)
    if not is_valid_ip_address(allowed_ip):
        return JsonResponse({'status': 'error', 'message': 'Enter a valid printer IP address'}, status=400)

    printer_id = data.get('id')
    if printer_id:
        printer = get_object_or_404(PrinterFilter, pk=printer_id)
        duplicate = PrinterFilter.objects.filter(allowed_ip=allowed_ip).exclude(pk=printer.pk).first()
        if duplicate:
            return JsonResponse({'status': 'error', 'message': 'That printer IP is already configured'}, status=400)
        printer.allowed_ip = allowed_ip
        printer.display_name = display_name
        printer.is_enabled = is_enabled
        printer.save(update_fields=['allowed_ip', 'display_name', 'is_enabled', 'updated_at'])
    else:
        printer, _ = PrinterFilter.objects.update_or_create(
            allowed_ip=allowed_ip,
            defaults={'display_name': display_name, 'is_enabled': is_enabled},
        )

    return JsonResponse({
        'status': 'success',
        'printer': serialize_printer_filter(printer),
    })


@require_POST
def delete_allowed_printer(request, printer_id):
    printer = get_object_or_404(PrinterFilter, pk=printer_id)
    deleted_name = printer.display_name or printer.allowed_ip
    printer.delete()
    return JsonResponse({
        'status': 'success',
        'message': f'{deleted_name} removed',
    })


def normalize_printer_name(value):
    if not isinstance(value, str):
        return ''
    return value.strip()[:255]


def normalize_printer_ip(value):
    if not isinstance(value, str):
        return ''
    return value.strip()[:45]


def is_valid_ip_address(value):
    try:
        ip_address(value)
    except ValueError:
        return False
    return True


def normalize_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in {'1', 'true', 'yes', 'on'}
    return bool(value)


def serialize_printer_filter(setting):
    allowed_ip = setting.allowed_ip if setting else ''
    display_name = setting.display_name if setting else ''
    enabled = bool(setting and setting.enabled)
    return {
        'id': setting.id if setting else None,
        'enabled': enabled,
        'is_enabled': bool(setting and setting.is_enabled),
        'allowed_ip': allowed_ip,
        'display_name': display_name,
    }


def normalize_sent_count(value, label_count):
    try:
        sent_count = int(value)
    except (TypeError, ValueError):
        return 0
    return min(max(sent_count, 0), label_count)


def normalize_client_context(value):
    if not isinstance(value, dict):
        return {}
    return {
        'platform': str(value.get('platform') or '')[:255],
        'language': str(value.get('language') or '')[:64],
        'vendor': str(value.get('vendor') or '')[:255],
    }


def update_print_job_client_context(print_job, client_context):
    if client_context.get('platform'):
        print_job.browser_platform = client_context['platform']
    if client_context.get('language'):
        print_job.browser_language = client_context['language']
    if client_context.get('vendor'):
        print_job.browser_vendor = client_context['vendor']


def get_requested_by(request):
    user = getattr(request, 'user', None)
    if user and user.is_authenticated:
        return user.get_username()[:150]
    return ''


def generate_lpn():
    suffix = ''.join(secrets.choice(LPN_ALPHABET) for _ in range(LPN_RANDOM_LENGTH))
    return f'{LPN_PREFIX}{suffix}'


def lpn_suffix(full_lpn):
    return full_lpn[-LPN_SUFFIX_LENGTH:]


def reserve_print_job(count, printer_name, requested_by='', user_agent='', client_context=None):
    max_attempts = 20
    client_context = client_context or {}

    for _ in range(max_attempts):
        candidate_count = min(MAX_BATCH_SIZE, max(count * 2, count + 10))
        candidates = []
        seen_lpns = set()
        seen_suffixes = set()
        while len(candidates) < candidate_count:
            candidate = generate_lpn()
            suffix = lpn_suffix(candidate)
            if candidate not in seen_lpns and suffix not in seen_suffixes:
                seen_lpns.add(candidate)
                seen_suffixes.add(suffix)
                candidates.append(candidate)

        existing = set(
            LPN.objects
            .filter(full_lpn__in=candidates)
            .values_list('full_lpn', flat=True)
        )
        existing_suffixes = set(
            LPNSuffix.objects
            .filter(suffix__in=[lpn_suffix(candidate) for candidate in candidates])
            .values_list('suffix', flat=True)
        )
        available = [
            candidate
            for candidate in candidates
            if candidate not in existing and lpn_suffix(candidate) not in existing_suffixes
        ]
        batch = available[:count]

        if len(batch) < count:
            continue

        try:
            with transaction.atomic():
                LPNSuffix.objects.bulk_create(
                    [LPNSuffix(suffix=lpn_suffix(full_lpn)) for full_lpn in batch],
                    batch_size=MAX_BATCH_SIZE,
                )
                print_job = PrintJob.objects.create(
                    label_count=count,
                    printer_name=printer_name,
                    requested_by=requested_by,
                    user_agent=user_agent,
                    browser_platform=client_context.get('platform', ''),
                    browser_language=client_context.get('language', ''),
                    browser_vendor=client_context.get('vendor', ''),
                )
                LPN.objects.bulk_create(
                    [LPN(full_lpn=full_lpn, print_job=print_job) for full_lpn in batch],
                    batch_size=MAX_BATCH_SIZE,
                )
        except IntegrityError:
            continue

        return print_job, batch

    raise RuntimeError('Unable to reserve enough unique LPNs')


def serialize_print_job(print_job):
    lpns = list(print_job.lpns.order_by('id').values_list('full_lpn', flat=True))
    return {
        'status': 'success',
        'job_id': print_job.id,
        'job_status': print_job.status,
        'printer_name': print_job.printer_name,
        'label_count': print_job.label_count,
        'sent_count': print_job.sent_count,
        'error_message': print_job.error_message,
        'requested_by': print_job.requested_by,
        'browser_platform': print_job.browser_platform,
        'browser_language': print_job.browser_language,
        'browser_vendor': print_job.browser_vendor,
        'completed_at': print_job.completed_at,
        'canceled_at': print_job.canceled_at,
        'lpns': lpns,
    }
