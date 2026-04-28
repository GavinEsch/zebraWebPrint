from django.urls import path
from . import views

"""This file is used to define the URL patterns for the userPrint app."""
urlpatterns = [
    path('', views.print, name='print'),
    path('adminPrint/', views.adminPrint, name='adminPrint'),
    path('api/reserve_lpns/', views.reserve_lpns, name='reserve_lpns'),
    path('api/print_jobs/<int:job_id>/', views.print_job_detail, name='print_job_detail'),
    path('api/print_jobs/<int:job_id>/status/', views.update_print_job_status, name='update_print_job_status'),
]
