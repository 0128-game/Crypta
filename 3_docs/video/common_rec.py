import json
D_ALL={'test':{'rating':'S','objectives':['A'],'done':True}}
for k in range(1,13): D_ALL[f'stage{k:02d}']={'rating':'S','objectives':['A'],'done':True}
CAP="""(t)=>{let c=document.getElementById('vcap'); if(!c){c=document.createElement('div'); c.id='vcap'; c.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:16px 24px;text-align:center;font:800 30px/1.4 "BIZ UDPGothic","Yu Gothic UI","Hiragino Kaku Gothic ProN","Meiryo",sans-serif;color:#FFFCF5;background:#263650;border-top:3px solid #F3C63F'; document.body.append(c)} c.textContent=t; c.style.display=t?'block':'none'}"""
