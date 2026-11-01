import json, time, glob, shutil, sys
sys.path.insert(0,'/tmp')
from common_rec import D_ALL, CAP
from playwright.sync_api import sync_playwright
BASE='http://localhost:8765'
out='/tmp/video/g1'; shutil.rmtree(out,ignore_errors=True)
with sync_playwright() as p:
    br=p.chromium.launch(); ctx=br.new_context(viewport={'width':1280,'height':720}, record_video_dir=out, record_video_size={'width':1280,'height':720})
    T0=time.time(); marks={}
    pg=ctx.new_page()
    pg.add_init_script("localStorage.setItem('crypta:progress', %s); for(let k=1;k<=12;k++){ if(k!==5) localStorage.setItem('crypta:intro:stage'+String(k).padStart(2,'0'),'1'); }" % json.dumps(json.dumps(D_ALL)))
    cap=lambda t: pg.evaluate(CAP,t)
    pg.goto(BASE+'/simulator.html?stage=stage05'); pg.wait_for_selector('.node-alice'); pg.wait_for_timeout(500)
    cap('ステージの頭で、事件が起きる（前の回路が、攻撃で、破られる）')
    for _ in range(600):
        if pg.locator('.demo-dialog:not([hidden])').count(): break
        pg.wait_for_timeout(150)
    marks['dialog']=round(time.time()-T0,1)
    cap('何が起きたか。どう守るか。スライドで、説明する')
    for i in range(6):
        pg.wait_for_timeout(1500)
        b=pg.locator('.demo-dialog .guide-foot button:last-child'); txt=b.inner_text(); b.click()
        if '守りを組む' in txt: break
    pg.wait_for_timeout(800); marks['build']=round(time.time()-T0,1)
    cap('守りを組む（部品を置いて、線でつなぐ）')
    pg.click('#brief-toggle'); pg.wait_for_timeout(400)
    pg.click('#solution-button'); pg.wait_for_timeout(2600)
    marks['run']=round(time.time()-T0,1)
    cap('攻撃にぶつける。Eve が読み、Mallory が書き換える')
    pg.click('#run-button'); pg.wait_for_timeout(500); t0=time.time()
    for _ in range(700):
        pg.wait_for_timeout(150)
        if pg.locator('#result:not([hidden])').count(): break
        if time.time()-t0>75 and pg.locator('#run-button').inner_text().find('スキップ')>=0: pg.click('#run-button')
    marks['result']=round(time.time()-T0,1)
    cap('守り切った！ 組んだ守りが、攻撃を、はね返した')
    pg.wait_for_timeout(4000); marks['end']=round(time.time()-T0,1)
    json.dump(marks,open('/tmp/video/g1_marks.json','w')); ctx.close(); br.close()
print(glob.glob(out+'/*.webm'), marks)
