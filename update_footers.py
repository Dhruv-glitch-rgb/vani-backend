import glob

for f in glob.glob('public/*.html'):
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
        
    old_text = '<a href="https://vani-xin.blogspot.com/" target="_blank" rel="noopener noreferrer">V.A.N.I-xAI Blog</a>\n            </div>'
    new_text = '<a href="https://vani-xin.blogspot.com/" target="_blank" rel="noopener noreferrer">V.A.N.I-xAI Blog</a> &bull;\n                <a href="/connect-with-us">Connect With Us</a>\n            </div>'
    
    if old_text in content:
        content = content.replace(old_text, new_text)
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)
        print(f"Updated {f}")
