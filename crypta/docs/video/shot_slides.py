from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    br=p.chromium.launch(); pg=br.new_page(viewport={'width':1280,'height':720})
    for s in ['title','cast','loop','stages','end']:
        pg.goto(f'http://localhost:8765/_slides.html?s={s}'); pg.wait_for_selector('body[data-ready]'); pg.wait_for_timeout(500)
        pg.screenshot(path=f'/tmp/video/slide_{s}.png')
    br.close()
