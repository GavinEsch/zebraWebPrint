from django.db import models

"""This class is used to define the LPN model."""
class LPN(models.Model):
    full_lpn = models.CharField(max_length=15)
    
    def __str__(self):
        return self.full_lpn