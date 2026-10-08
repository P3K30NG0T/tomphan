# Builds preview/index.html: one self-contained page for the Claude artifact preview.
# Usage (repo root): npx esbuild assets/app.js --bundle --format=esm --minify --outfile=preview/bundle.js && python3 scripts/build_preview.py
import shutil, os
src = open('index.html', encoding='utf-8').read()
body = src.split('<!--BODY-START-->')[1].split('<!--BODY-END-->')[0]
body = body.replace('<script type="module" src="assets/app.js"></script>', '')
body = body.replace('<a class="btn" href="downloads/tomphan-h100-model.xlsx" download>Download Excel model</a>',
                    '<p class="muted" style="font-size:12.5px">The Excel model downloads from the live site.</p>')
css = open('assets/style.css', encoding='utf-8').read()
js = open('preview/bundle.js', encoding='utf-8').read()
fonts = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap'
out = f'<title>tomphan. Portfolio</title>\n<link rel="stylesheet" href="{fonts}">\n<style>\n{css}\n</style>\n{body}<script type="module">\n{js}\n</script>\n'
open('preview/index.html', 'w', encoding='utf-8').write(out)
os.makedirs('preview/data', exist_ok=True)
for f in ('market.json', 'runlog.json', 'runs.json'):
    shutil.copy(f'data/{f}', f'preview/data/{f}')
print('preview/index.html', len(out), 'bytes')
