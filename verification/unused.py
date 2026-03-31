import re
import os

def find_unused():
    all_exports = []

    for f in ["src/lib/hexGrid.ts", "src/lib/hexGameLogic.ts"]:
        with open(f, "r") as file:
            content = file.read()
            # find function names
            funcs = re.findall(r'function\s+([a-zA-Z0-9_]+)', content)
            all_exports.extend(funcs)

    print(f"Total functions found: {len(all_exports)}")

    # search all files for usages
    for func in all_exports:
        cmd = f'grep -rn "{func}" src/ | wc -l'
        count = int(os.popen(cmd).read().strip())
        if count <= 1:
            print(f"Function {func} is unused! (Count: {count})")

find_unused()
