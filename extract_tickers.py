import re

with open('js/tickers.js', 'r', encoding='utf-8') as f:
    text = f.read()

# match ["TICKER",
matches = re.findall(r'\[\"([A-Z\.]+)\",', text)

with open('tickers_list.txt', 'w', encoding='utf-8') as f:
    f.write(', '.join(matches))
