import json

with open('/Users/nelsoncarrillokosak/valet-eye/scratch/lost_code.json', 'r') as f:
    data = json.load(f)

chunks = json.loads(data['tool_calls'][0]['args']['ReplacementChunks'])
for i, chunk in enumerate(chunks):
    with open(f'/Users/nelsoncarrillokosak/valet-eye/scratch/chunk_{i}.txt', 'w') as f_out:
        f_out.write(chunk['ReplacementContent'])
