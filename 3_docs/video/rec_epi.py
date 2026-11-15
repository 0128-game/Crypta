import json, time, glob, shutil, sys
sys.path.insert(0,'/tmp')
from common_rec import D_ALL, CAP
from playwright.sync_api import sync_playwright
BASE='http://localhost:8765'
out='/tmp/video/g2'; shutil.rmtree(out,ignore_errors=True)
with sync_playwright() as p:
    br=p.chromium.launch(); ctx=br.new_context(viewport={'width':1280,'height':720}, record_video_dir=out, record_video_size={'width':1280,'height':720})
    T0=time.time(); marks={}
    pg=ctx.new_page(); pg.add_init_script("localStorage.setItem('crypta:progress', %s);" % json.dumps(json.dumps(D_ALL)))
    cap=lambda t: pg.evaluate(CAP,t)
    pg.goto(BASE+'/simulator.html?stage=stage12'); pg.wait_for_selector('.node-alice'); pg.wait_for_timeout(800)
    cap('最後は、エピローグ。見届けるだけ')
    pg.wait_for_timeout(2200); marks['start']=round(time.time()-T0,1)
    pg.click('.epilogue-start'); cap('')
    for _ in range(900):
        pg.wait_for_timeout(150)
        if pg.locator('.demo-dialog:not([hidden])').count(): break
    marks['dialog']=round(time.time()-T0,1)
    pg.wait_for_timeout(6000); marks['end']=round(time.time()-T0,1)
    json.dump(marks,open('/tmp/video/g2_marks.json','w')); ctx.close(); br.close()
print(glob.glob(out+'/*.webm'), marks)
