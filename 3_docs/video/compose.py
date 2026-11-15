import subprocess, glob, json, os
V='/tmp/video'; g1=glob.glob(V+'/g1/*.webm')[0]; g2=glob.glob(V+'/g2/*.webm')[0]
m1=json.load(open(V+'/g1_marks.json')); m2=json.load(open(V+'/g2_marks.json'))
segs=[]  # (name, kind, src, start, end, speed or duration)
segs.append(('s_title','img',V+'/slide_title.png',0,4,1))
segs.append(('s_cast','img',V+'/slide_cast.png',0,6,1))
segs.append(('s_loop','img',V+'/slide_loop.png',0,6,1))
segs.append(('g1a','vid',g1,1.0,m1['dialog'],3.0))
segs.append(('g1b','vid',g1,m1['dialog'],m1['run'],1.3))
segs.append(('g1c','vid',g1,m1['run'],m1['result'],3.0))
segs.append(('g1d','vid',g1,m1['result'],m1['end'],1.0))
segs.append(('s_stages','img',V+'/slide_stages.png',0,6,1))
segs.append(('g2a','vid',g2,1.0,m2['start'],1.0))
segs.append(('g2b','vid',g2,m2['start'],m2['dialog'],1.35))
segs.append(('g2c','vid',g2,m2['dialog'],m2['end'],1.0))
segs.append(('s_end','img',V+'/slide_end.png',0,6,1))
files=[]; total=0
for name,kind,src,s,e,sp in segs:
    dur=(e-s)/sp if kind=='vid' else (e-s)
    total+=dur; out=f'{V}/{name}.mp4'; files.append(out)
    fade=f"fade=t=in:st=0:d=0.35,fade=t=out:st={max(dur-0.35,0):.2f}:d=0.35"
    if kind=='img':
        cmd=['ffmpeg','-y','-v','error','-loop','1','-t',str(dur),'-i',src,'-vf',f'scale=1280:720,fps=30,{fade},format=yuv420p','-an','-c:v','libx264','-crf','20',out]
    else:
        cmd=['ffmpeg','-y','-v','error','-ss',str(s),'-to',str(e),'-i',src,'-vf',f'setpts=PTS/{sp},fps=30,scale=1280:720,{fade},format=yuv420p','-an','-c:v','libx264','-crf','20',out]
    subprocess.run(cmd,check=True)
open(V+'/list.txt','w').write(''.join(f"file '{f}'\n" for f in files))
subprocess.run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',V+'/list.txt','-c','copy',V+'/silent.mp4'],check=True)
subprocess.run(['ffmpeg','-y','-v','error','-i',V+'/silent.mp4','-f','lavfi','-i','anullsrc=r=44100:cl=stereo','-shortest','-c:v','copy','-c:a','aac','-b:a','96k','-movflags','+faststart','/mnt/user-data/outputs/crypta-intro.mp4'],check=True)
print('予定の長さ: %.1f 秒' % total)
print(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration,size','-of','default=nw=1','/mnt/user-data/outputs/crypta-intro.mp4'],capture_output=True,text=True).stdout)
