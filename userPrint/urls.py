from django.urls import path
from . import views

urlpatterns = [
    path('', views.print, name='print'),
    path('adminPrint/', views.adminPrint, name='adminPrint'),
    path('api/add_lpn/', views.add_lpn, name='add_lpn'),
]