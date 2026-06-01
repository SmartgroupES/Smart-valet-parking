from bs4 import BeautifulSoup

with open('frontend/index.html', 'r', encoding='utf-8') as f:
    soup = BeautifulSoup(f, 'html.parser')

scripts = soup.find_all('script')
for i, script in enumerate(scripts):
    if script.string:
        lines = script.string.split('\n')
        if len(lines) >= 129:
            print(f"--- Script {i} (line {script.sourceline}) Line 129 ---")
            print(lines[128].strip())
            print(f"Line 128: {lines[127].strip()}")
            print(f"Line 130: {lines[129].strip()}")
