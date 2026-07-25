import re
import sys
with open('frontend/index.html', 'r') as f:
    html = f.read()
scripts = re.findall(r'<script>(.*?)</script>', html, re.DOTALL)
with open('scratch/temp_check.js', 'w') as f:
    for s in scripts:
        f.write(s + "\n")
