from django.db import models

class LPN(models.Model):
    full_lpn = models.CharField(max_length=15)
    
    def __str__(self):
        return self.full_lpn