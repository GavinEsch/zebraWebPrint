from django.urls import path
from . import views

"""This file is used to define the URL patterns for the userPrint app."""
urlpatterns = [
    path('', views.print, name='print'),
    path('adminPrint/', views.adminPrint, name='adminPrint'),
    path('adminPrint/printers/', views.printerManagement, name='printerManagement'),
    path('api/reserve_lpns/', views.reserve_lpns, name='reserve_lpns'),
    path('api/printer_filter/', views.printer_filter, name='printer_filter'),
    path('api/printer_filter/update/', views.update_printer_filter, name='update_printer_filter'),
    path('api/printers/', views.allowed_printers, name='allowed_printers'),
    path('api/printers/save/', views.save_allowed_printer, name='save_allowed_printer'),
    path('api/printers/<int:printer_id>/delete/', views.delete_allowed_printer, name='delete_allowed_printer'),
    path('api/print_jobs/<int:job_id>/', views.print_job_detail, name='print_job_detail'),
    path('api/print_jobs/<int:job_id>/status/', views.update_print_job_status, name='update_print_job_status'),
]
