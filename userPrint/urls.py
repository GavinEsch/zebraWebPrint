from django.urls import path
from . import views

"""This file is used to define the URL patterns for the userPrint app."""
urlpatterns = [
    path('', views.print, name='print'),
    path('adminPrint/', views.adminPrint, name='adminPrint'),
    path('api/add_lpn/', views.add_lpn, name='add_lpn'),
]