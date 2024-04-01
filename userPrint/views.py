from django.http import JsonResponse
from django.shortcuts import render
from .models import LPN

from django.views.decorators.csrf import csrf_exempt

"""This function is used to display the print page. It is called when the user clicks the 'Print' button on the home page."""
def print(request):
    return render(request, 'userPrint/printPage.html')

"""This function is used to display the admin print page. It is called when the user clicks the 'Admin Print' button on the print page."""
def adminPrint(request):
    return render(request, 'userPrint/adminPrintPage.html')

"""
This function is used to add a new LPN to the database. It is called when the user enters a new LPN in the input field and clicks the 'Add LPN' button.
"""
@csrf_exempt
def add_lpn(request):
    if request.method == 'POST':
        import json
        data = json.loads(request.body)
        full_lpn = data.get('full_lpn')

        if LPN.objects.filter(full_lpn=full_lpn).exists():
            return JsonResponse({'status': 'error', 'message': 'LPN already exists'}, status=400)

        lpn = LPN(full_lpn=full_lpn)
        lpn.save()

        return JsonResponse({'status': 'success', 'lpn': lpn.full_lpn})
    
    return JsonResponse({'status': 'error', 'message': 'Invalid request'}, status=400)