"""
Diagnostic script to find all missing DOM element IDs referenced in command_center.html
"""

import re

with open("apps/web_command_center/static/command_center.html", "r", encoding="utf-8") as f:
    content = f.read()

# Split into HTML and Script
script_match = re.search(r"<script>(.*)</script>", content, re.DOTALL)
if script_match:
    script_content = script_match.group(1)
    html_content = content[:script_match.start()]
else:
    script_content = content
    html_content = content

# Find all $('#...') or $("#...") in script
selectors = re.findall(r"\$\(['\"]#([a-zA-Z0-9_\-]+)['\"]\)", script_content)
unique_selectors = set(selectors)

# Find all id="..." in HTML
html_ids = set(re.findall(r'id=["\']([a-zA-Z0-9_\-]+)["\']', html_content))

missing = unique_selectors - html_ids
print(f"Total Unique Selectors referenced: {len(unique_selectors)}")
print(f"Total HTML IDs found: {len(html_ids)}")
print(f"Missing IDs that will cause JS TypeError null crashes:")
for m in sorted(missing):
    print(f"  - #{m}")
