# Generates desktop/icon-1024.png (the app icon source).
# Usage: python3 desktop/icons.py [output.png] [--legacy]   (needs Pillow and numpy)
# Default: full-bleed square, no baked shadow. macOS 26 and later mask it and add the shadow themselves;
# a pre-masked icon with its own shadow gets shrunk into a grey plate there.
# --legacy: pre-masked squircle with a baked drop shadow, for macOS 15 and earlier.
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import numpy as np, math
S=2048; K=S/1024
def sq(n=5.0,size=824,cx=512,cy=512,steps=720):
    pts=[];a=size/2
    for i in range(steps):
        t=2*math.pi*i/steps; c,s=math.cos(t),math.sin(t)
        x=a*abs(c)**(2/n)*(1 if c>=0 else -1); y=a*abs(s)**(2/n)*(1 if s>=0 else -1)
        pts.append(((cx+x)*K,(cy+y)*K))
    m=Image.new('L',(S,S),0); ImageDraw.Draw(m).polygon(pts,fill=255); return m
def rr(box,r,fill=255,size=(S,S)):
    m=Image.new('L',size,0); ImageDraw.Draw(m).rounded_rectangle([v*K for v in box],radius=r*K,fill=fill); return m
def grad(top,bot,size=(S,S)):
    t=np.linspace(0,1,size[1])[:,None,None]; a=np.array(top,float)[None,None,:]; b=np.array(bot,float)[None,None,:]
    arr=(a*(1-t)+b*t)*np.ones((1,size[0],1)); return Image.fromarray(arr.astype('uint8'),'RGB')
def solid(c): return Image.new('RGB',(S,S),c)
def comp(base,layer,mask,alpha=1.0):
    if alpha<1: mask=mask.point(lambda v:int(v*alpha))
    base.paste(layer,(0,0),mask); return base
def shadow(base,mask,dy,blur,alpha,color=(0,0,0)):
    m=ImageChops.offset(mask,0,int(dy*K)).filter(ImageFilter.GaussianBlur(blur*K)).point(lambda v:int(v*alpha))
    base.paste(Image.new('RGB',(S,S),color),(0,0),m)
def edge(base,mask,w,alpha,color=(255,255,255),top=True):
    inner=mask.filter(ImageFilter.MinFilter(int(w*2*K)//2*2+1))
    ring=ImageChops.subtract(mask,inner)
    if top:
        g=Image.fromarray((np.linspace(1,0,S)[:,None]*np.ones((1,S))*255).astype('uint8'))
        ring=ImageChops.multiply(ring,g)
    base.paste(Image.new('RGB',(S,S),color),(0,0),ring.point(lambda v:int(v*alpha)))
def finish(body_layer_fn,bleed=True):
    canvas=Image.new('RGBA',(S,S),(0,0,0,0)); rgb=Image.new('RGB',(S,S),(0,0,0))
    mask=Image.new('L',(S,S),255) if bleed else sq()
    # drop shadow on transparent: build separately
    sh=Image.new('L',(S,S),0)
    s1=ImageChops.offset(mask,0,int(14*K)).filter(ImageFilter.GaussianBlur(22*K)).point(lambda v:int(v*.38))
    s2=ImageChops.offset(mask,0,int(3*K)).filter(ImageFilter.GaussianBlur(4*K)).point(lambda v:int(v*.30))
    sh=ImageChops.lighter(s1,s2)
    if not bleed: canvas.paste(Image.new('RGBA',(S,S),(10,16,28,255)),(0,0),sh)
    body=body_layer_fn(mask)
    ba=body.convert('RGBA'); ba.putalpha(mask)
    canvas.alpha_composite(ba)
    return canvas.resize((1024,1024),Image.LANCZOS)

# ---- A: refined board (same metaphor, slate-blue, depth)
def A(mask):
    im=grad((112,142,184),(40,66,108)); 
    glow=Image.new('L',(S,S),0); ImageDraw.Draw(glow).ellipse([int(150*K),int(60*K),int(870*K),int(560*K)],fill=120)
    glow=glow.filter(ImageFilter.GaussianBlur(120*K)); im.paste(Image.new('RGB',(S,S),(190,208,236)),(0,0),glow.point(lambda v:v//2))
    tiles=[((222,222,552,486),(250,252,255),(236,241,248)),((582,222,802,486),(250,252,255),(236,241,248)),((222,516,442,802),(250,252,255),(236,241,248)),((472,516,802,802),None,None)]
    for box,t,b in tiles:
        m=rr(box,46)
        shadow(im,m,10,16,.30,(14,26,52)); shadow(im,m,2,3,.25,(14,26,52))
        if t: comp(im,grad(t,b),m)
        else: comp(im,grad((150,196,255),(96,150,236)),m)   # single accent tile
        edge(im,m,2,.7)
    if mask.getpixel((0,0))==0: edge(im,mask,3,.35)
    return im

if __name__=='__main__':
    args=[a for a in sys.argv[1:] if not a.startswith('--')]
    out=args[0] if args else 'icon-1024.png'
    finish(A,bleed='--legacy' not in sys.argv).save(out)
