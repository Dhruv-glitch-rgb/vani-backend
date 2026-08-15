import glob

# Strings to find
vani_copyright = '<p>V.A.N.I-xAI: Vāṇī Adhyātmik Navīn Intellect &copy; 2026. All rights reserved.</p>'
saras_copyright = '<p><strong>Saras.WebSearch</strong> &bull; Integrated In-App Search Engine for <a href="./index.html">V.A.N.I-xAI</a> &copy; 2026. Made with ❤️ in India.</p>'

# Replacement strings with the tagline
tagline_html = '\n            <p style="margin-top: 5px; font-style: italic; font-weight: 500; color: var(--accent-cyan, #06b6d4);">Don\'t Assume, Verify.</p>'

vani_new = vani_copyright + tagline_html
saras_new = saras_copyright + tagline_html

files_updated = 0

for f in glob.glob('public/*.html'):
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
        
    modified = False
    
    # Replace V.A.N.I-xAI copyright
    if vani_copyright in content and "Don't Assume, Verify." not in content.split(vani_copyright)[1][:300]:
        content = content.replace(vani_copyright, vani_new)
        modified = True
        
    # Replace Saras.WebSearch copyright
    if saras_copyright in content and "Don't Assume, Verify." not in content.split(saras_copyright)[1][:300]:
        content = content.replace(saras_copyright, saras_new)
        modified = True
        
    if modified:
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)
        print(f"Updated {f}")
        files_updated += 1

print(f"Done! Updated {files_updated} files.")
