from pathlib import Path

path = Path('app/page.jsx')
text = path.read_text(encoding='utf-8')
old = ".filter((item) => item.name && item.quantity > 0 && item.price >= 0);\\n    if (items.length === 0) {\\n      showToast(\"Add at least one item to the invoice\", \"error\");\\n      return;\\n    }\\n    const amount = items.reduce((sum, item) => sum + lineTotal(item), 0);\\n    const client = form.get(\"client\").trim();\\n    const dueDate = form.get(\"dueDate\");\\n    \\\n    if (!client) {\\n      showToast(\"Enter a client name\", \"error\");\\n      return;\\n    }\\n    if (!dueDate) {\\n      showToast(\"Select a due date\", \"error\");\\n      return;\\n    }\\n    if (amount <= 0) {\\n      showToast(\"Invoice amount must be greater than 0\", \"error\");\\n      return;\\n    }\\n"
new = ".filter((item) => item.name && item.quantity > 0 && item.price >= 0);\n    if (items.length === 0) {\n      showToast(\"Add at least one item to the invoice\", \"error\");\n      return;\n    }\n    const amount = items.reduce((sum, item) => sum + lineTotal(item), 0);\n    const client = form.get(\"client\").trim();\n    const dueDate = form.get(\"dueDate\");\n\n    if (!client) {\n      showToast(\"Enter a client name\", \"error\");\n      return;\n    }\n    if (!dueDate) {\n      showToast(\"Select a due date\", \"error\");\n      return;\n    }\n    if (amount <= 0) {\n      showToast(\"Invoice amount must be greater than 0\", \"error\");\n      return;\n    }\n"

if old not in text:
    raise SystemExit('Old text not found')

text = text.replace(old, new)
path.write_text(text, encoding='utf-8')
print('patched')
