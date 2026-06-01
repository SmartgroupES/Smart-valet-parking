from bs4 import BeautifulSoup
import sys

with open('frontend/index.html', 'r', encoding='utf-8') as f:
    soup = BeautifulSoup(f, 'html.parser')

scripts = soup.find_all('script')
for i, script in enumerate(scripts):
    if script.string:
        with open(f'frontend/script_{i}.js', 'w', encoding='utf-8') as out:
            # Pad with empty lines so that line numbers match the original index.html
            # Or just output them directly.
            # Let's pad so line errors match exactly line numbers in index.html
            line_offset = script.sourceline
            # BeautifulSoup sourceline points to the <script> tag itself.
            if line_offset:
                out.write('\n' * (line_offset))
                out.write(script.string)
