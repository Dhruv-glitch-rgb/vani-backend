import urllib.request
import urllib.error
import json

def test_openrouter():
    api_key = "YOUR_API_KEY_HERE"
    
    req = urllib.request.Request(
        'https://openrouter.ai/api/v1/chat/completions',
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        },
        data=json.dumps({
            'model': 'google/gemma-4-31b-it:free',
            'messages': [{'role': 'user', 'content': 'hello'}]
        }).encode('utf-8')
    )

    try:
        with urllib.request.urlopen(req) as response:
            print(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print(e.code, e.read().decode('utf-8'))
