import re
import sys

tickers_to_remove = ["CRWD","PANW","FTNT","MDB","SIEGY","BAM","VRSK","MMC","AON","AZN","ZTS","EFX","LVMUY","HESAY","CMPGY","CFRUY"]

tickers_to_add = [
  '["PSTG", "Pure Storage", "Technology", "Hardware", "Narrow", ["Switching Costs"], "Competition", "Tech spending cycle"]',
  '["LEU", "Centrus Energy", "Energy", "Uranium", "Narrow", ["Cost Advantages"], "Regulatory risk", "Commodity prices"]',
  '["NNE", "Nano Nuclear Energy", "Energy", "Nuclear", "None", [], "Development risk", "Regulatory approval"]',
  '["SOFI", "SoFi Technologies", "Financials", "Fintech", "Narrow", ["Network Effects"], "Credit risk", "Competition"]',
  '["NU", "Nu Holdings", "Financials", "Fintech", "Narrow", ["Network Effects", "Cost Advantages"], "Credit risk", "LATAM macro risk"]',
  '["UEC", "Uranium Energy Corp", "Energy", "Uranium", "None", [], "Commodity prices", "Regulatory risk"]',
  '["HPE", "Hewlett Packard Enterprise", "Technology", "Hardware", "Narrow", ["Switching Costs"], "Cloud transition", "Macro sensitivity"]',
  '["NTAP", "NetApp", "Technology", "Hardware", "Narrow", ["Switching Costs"], "Competition", "Cloud transition"]'
]

with open('js/tickers.js', 'r', encoding='utf-8') as f:
    content = f.read()

# remove tickers
lines = content.split('\n')
new_lines = []
for line in lines:
    skip = False
    for t in tickers_to_remove:
        if f'"{t}"' in line:
            skip = True
            break
    if not skip:
        new_lines.append(line)

content = '\n'.join(new_lines)

# add tickers before the closing array bracket
match = re.search(r'\]\s*;\s*\n\s*export const TICKERS_DATA', content)
if match:
    insert_pos = match.start()
    add_str = ",\n  " + ",\n  ".join(tickers_to_add) + "\n"
    # To fix trailing commas, we need to ensure the previous line has a comma, but in JS trailing commas are fine or we can just append
    # Actually if the last line doesn't have a comma, we should add one.
    
    # Just replace the last ] with the new items + ]
    content = content[:insert_pos] + add_str + content[insert_pos:]

with open('js/tickers.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Tickers updated successfully!")
