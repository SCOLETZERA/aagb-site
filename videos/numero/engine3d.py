"""
Mini motor 3D (OpenGL via moderngl, funciona sem GPU com Mesa llvmpipe) para
personagens e cenários em blocos: luz do sol, sombras, céu, neblina, rostos
procedurais, chão com "studs" e janelas procedurais.
"""
import math
import numpy as np
import moderngl

# ---------------------------------------------------------------- matemática
def T(x, y, z):
    m = np.eye(4, dtype=np.float32); m[:3, 3] = (x, y, z); return m

def S(x, y, z):
    return np.diag([x, y, z, 1]).astype(np.float32)

def Rx(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0, 0], [0, c, -s, 0], [0, s, c, 0], [0, 0, 0, 1]], np.float32)

def Ry(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1]], np.float32)

def Rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0, 0], [s, c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]], np.float32)

def look_at(eye, target, up=(0, 1, 0)):
    eye = np.array(eye, np.float32); target = np.array(target, np.float32); up = np.array(up, np.float32)
    f = target - eye; f /= np.linalg.norm(f)
    s = np.cross(f, up); s /= np.linalg.norm(s)
    u = np.cross(s, f)
    m = np.eye(4, dtype=np.float32)
    m[0, :3] = s; m[1, :3] = u; m[2, :3] = -f
    m[:3, 3] = -m[:3, :3] @ eye
    return m

def perspective(fov_deg, aspect, near=0.1, far=400.0):
    f = 1 / math.tan(math.radians(fov_deg) / 2)
    m = np.zeros((4, 4), np.float32)
    m[0, 0] = f / aspect; m[1, 1] = f
    m[2, 2] = (far + near) / (near - far); m[2, 3] = 2 * far * near / (near - far); m[3, 2] = -1
    return m

def ortho(l, r, b, t, n, f):
    m = np.eye(4, dtype=np.float32)
    m[0, 0] = 2 / (r - l); m[1, 1] = 2 / (t - b); m[2, 2] = -2 / (f - n)
    m[0, 3] = -(r + l) / (r - l); m[1, 3] = -(t + b) / (t - b); m[2, 3] = -(f + n) / (f - n)
    return m

# ---------------------------------------------------------------- tipos de bloco
PLAIN, HEAD, STUDS, WINDOWS, EMISSIVE, WOOD, LEAVES, SCREEN = range(8)
# expressões (rosto)
SMILE, SAD, SHOCK, LAUGH, NEUTRAL, HAPPY, CRY, SMIRK = range(8)

def box(m, size, color, kind=PLAIN, param=0.0):
    """m = matriz do centro do bloco (sem escala). size = (sx,sy,sz)."""
    return (m @ S(*size), size, color, kind, param)

# ---------------------------------------------------------------- shaders
VS = """
#version 330
in vec3 in_pos; in vec3 in_norm; in vec2 in_uv; in float in_face;
in mat4 i_model; in vec3 i_size; in vec3 i_color; in vec2 i_kind;
uniform mat4 u_vp; uniform mat4 u_light_vp;
out vec3 v_world; out vec3 v_norm; out vec2 v_uv; flat out float v_face;
flat out vec3 v_size; flat out vec3 v_color; flat out vec2 v_kind; out vec4 v_lpos;
void main(){
  vec4 w = i_model * vec4(in_pos, 1.0);
  v_world = w.xyz;
  v_norm = normalize(mat3(i_model) * (in_norm / (i_size * i_size)));
  v_uv = in_uv; v_face = in_face; v_size = i_size; v_color = i_color; v_kind = i_kind;
  v_lpos = u_light_vp * w;
  gl_Position = u_vp * w;
}
"""

FS = """
#version 330
in vec3 v_world; in vec3 v_norm; in vec2 v_uv; flat in float v_face;
flat in vec3 v_size; flat in vec3 v_color; flat in vec2 v_kind; in vec4 v_lpos;
uniform vec3 u_sun_dir; uniform vec3 u_sun_col; uniform vec3 u_sky_top; uniform vec3 u_sky_bot;
uniform vec3 u_amb; uniform vec3 u_eye; uniform float u_fog; uniform sampler2DShadow u_shadow;
uniform float u_time;
out vec4 f_color;

float ell(vec2 p, vec2 c, vec2 r){ vec2 d=(p-c)/r; return length(d); }

vec3 face(vec3 base, vec2 uv, float e){
  vec3 ink = vec3(0.12,0.10,0.12);
  vec2 p = uv;
  // olhos
  float eh = (e==2.0)?0.13:0.10;
  bool closed = (e==5.0);
  for(int i=0;i<2;i++){
    float cx = (i==0)?0.34:0.66;
    if(closed){
      float d = abs(length((p-vec2(cx,0.52))/vec2(1.0,1.0))-0.07);
      if(d<0.018 && p.y>0.52) return ink;
    } else {
      if(ell(p, vec2(cx,0.58), vec2(0.055,eh))<1.0){
        if(ell(p, vec2(cx-0.015,0.62), vec2(0.018,0.03))<1.0) return vec3(1.0);
        return ink;
      }
    }
  }
  // sobrancelhas tristes
  if(e==1.0 || e==6.0){
    for(int i=0;i<2;i++){
      float s = (i==0)?1.0:-1.0; float cx=(i==0)?0.34:0.66;
      vec2 a=vec2(cx-0.07,0.74+0.04*s), b=vec2(cx+0.07,0.74-0.04*s);
      vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);
      if(length(pa-ba*h)<0.016) return ink;
    }
  }
  // boca
  vec2 m = p - vec2(0.5, 0.36);
  if(e==0.0 || e==5.0){ float d=abs(length(m*vec2(1.0,1.3)-vec2(0.0,0.10))-0.17); if(d<0.022 && m.y<0.02) return ink; }
  if(e==7.0){ float d=abs(length((m-vec2(0.05,0.0))*vec2(1.0,1.6)-vec2(0.0,0.14))-0.15); if(d<0.022 && m.y<0.0 && m.x>-0.05) return ink; }
  if(e==1.0 || e==6.0){ float d=abs(length(m*vec2(1.0,1.3)+vec2(0.0,0.16))-0.15); if(d<0.022 && m.y>-0.06) return ink; }
  if(e==2.0){ if(ell(p, vec2(0.5,0.3), vec2(0.07,0.09))<1.0) return vec3(0.45,0.08,0.12); }
  if(e==3.0){ if(m.y<0.02 && ell(p, vec2(0.5,0.38), vec2(0.17,0.15))<1.0) return (m.y<-0.08)?vec3(0.85,0.35,0.4):vec3(0.45,0.08,0.12); }
  if(e==4.0){ if(abs(m.y)<0.018 && abs(m.x)<0.12) return ink; }
  if(e==6.0){ if(ell(p, vec2(0.68,0.42), vec2(0.03,0.06))<1.0) return vec3(0.4,0.7,1.0); }
  // bochechas
  if(ell(p, vec2(0.22,0.42), vec2(0.07,0.04))<1.0 || ell(p, vec2(0.78,0.42), vec2(0.07,0.04))<1.0)
    return mix(base, vec3(1.0,0.55,0.55), 0.35);
  return base;
}

void main(){
  vec3 n = normalize(v_norm);
  vec3 col = v_color;
  float kind = v_kind.x;
  // tamanho da face atual em unidades do mundo (para bordas e padrões)
  vec2 fs;
  int f = int(v_face+0.5);
  if(f<2) fs = v_size.zy; else if(f<4) fs = v_size.xz; else fs = v_size.xy;
  vec2 wuv = v_uv * fs;
  if(kind==1.0 && f==4) col = face(col, v_uv, v_kind.y);
  if(kind==2.0 && f==2){
    vec2 g = fract(v_world.xz) - 0.5;
    float r = length(g);
    if(r<0.3) col *= (g.y < 0.0 ? 1.10 : 0.93);
    if(r>0.3 && r<0.34) col *= 0.88;
  }
  if(kind==3.0 && f!=2 && f!=3){
    vec2 g = fract(wuv / vec2(2.6, 3.0));
    if(g.x>0.25 && g.x<0.75 && g.y>0.3 && g.y<0.8 && wuv.y>1.5 && wuv.y<fs.y-1.0){
      col = mix(vec3(0.55,0.75,0.95), vec3(1.0,0.85,0.5), v_kind.y);
      if(abs(g.x-0.5)<0.02 || abs(g.y-0.55)<0.02) col = vec3(0.9);
    }
  }
  if(kind==5.0){ col *= 0.92 + 0.08*sin(wuv.y*18.0 + sin(wuv.x*3.0)*2.0); }
  if(kind==6.0){ vec2 g=fract(wuv*1.3); col *= 0.9 + 0.12*step(0.5, g.x)*step(0.5,g.y); }
  if(kind==4.0 || (kind==7.0 && f==4)){
    vec3 e = (kind==7.0) ? vec3(0.55,0.8,1.0) : col;
    f_color = vec4(e, 1.0); return;
  }
  // borda chanfrada
  float ed = min(min(wuv.x, fs.x-wuv.x), min(wuv.y, fs.y-wuv.y));
  if(kind!=2.0 && ed < 0.05) col *= 1.12;
  // sombra (PCF)
  vec3 lp = v_lpos.xyz / v_lpos.w * 0.5 + 0.5;
  float sh = 0.0;
  float bias = 0.0015 + 0.002*(1.0-max(dot(n,-u_sun_dir),0.0));
  for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++)
    sh += texture(u_shadow, vec3(lp.xy + vec2(x,y)/2048.0, lp.z - bias));
  sh /= 9.0;
  if(lp.x<0.0||lp.x>1.0||lp.y<0.0||lp.y>1.0) sh = 1.0;
  float ndl = max(dot(n, -u_sun_dir), 0.0);
  vec3 hemi = mix(u_sky_bot*0.55, u_sky_top, n.y*0.5+0.5);
  vec3 light = u_amb + hemi*0.45 + u_sun_col*ndl*sh;
  vec3 c = col * light;
  // brilho especular leve
  vec3 v = normalize(u_eye - v_world);
  vec3 h = normalize(v - u_sun_dir);
  c += u_sun_col * pow(max(dot(n,h),0.0), 40.0) * 0.18 * sh;
  float d = length(u_eye - v_world);
  float fog = 1.0 - exp(-pow(d*u_fog, 2.0));
  c = mix(c, u_sky_bot, clamp(fog,0.0,1.0));
  f_color = vec4(pow(c, vec3(0.92)), 1.0);
}
"""

SHADOW_VS = """
#version 330
in vec3 in_pos; in mat4 i_model; uniform mat4 u_light_vp;
void main(){ gl_Position = u_light_vp * i_model * vec4(in_pos,1.0); }
"""
SHADOW_FS = "#version 330\nvoid main(){}"

SKY_VS = """
#version 330
in vec2 in_pos; out vec2 v;
void main(){ v = in_pos; gl_Position = vec4(in_pos, 0.999, 1.0); }
"""
SKY_FS = """
#version 330
in vec2 v; uniform vec3 u_sky_top; uniform vec3 u_sky_bot; uniform vec2 u_sun_screen; uniform vec3 u_sun_col;
uniform float u_aspect; out vec4 f_color;
void main(){
  float t = clamp(v.y*0.5+0.5, 0.0, 1.0);
  vec3 c = mix(u_sky_bot, u_sky_top, pow(t, 0.8));
  vec2 d = (v - u_sun_screen) * vec2(u_aspect, 1.0);
  float r = length(d);
  c += u_sun_col * (smoothstep(0.09, 0.07, r)*0.9 + exp(-r*5.0)*0.35);
  f_color = vec4(c, 1.0);
}
"""

def cube_mesh():
    faces = [  # normal, eixo u, eixo v
        ((1, 0, 0), (0, 0, -1), (0, 1, 0)), ((-1, 0, 0), (0, 0, 1), (0, 1, 0)),
        ((0, 1, 0), (1, 0, 0), (0, 0, -1)), ((0, -1, 0), (1, 0, 0), (0, 0, 1)),
        ((0, 0, 1), (1, 0, 0), (0, 1, 0)), ((0, 0, -1), (-1, 0, 0), (0, 1, 0)),
    ]
    data = []
    for fi, (n, u, v) in enumerate(faces):
        n, u, v = np.array(n, float), np.array(u, float), np.array(v, float)
        corners = []
        for (a, b) in [(0, 0), (1, 0), (1, 1), (0, 1)]:
            p = n * 0.5 + u * (a - 0.5) + v * (b - 0.5)
            corners.append((*p, *n, a, b, fi))
        for idx in (0, 1, 2, 0, 2, 3):
            data.append(corners[idx])
    return np.array(data, np.float32)

class Renderer:
    def __init__(self, W, H, samples=4):
        self.W, self.H = W, H
        self.ctx = moderngl.create_standalone_context(backend="egl")
        ctx = self.ctx
        self.prog = ctx.program(vertex_shader=VS, fragment_shader=FS)
        self.sprog = ctx.program(vertex_shader=SHADOW_VS, fragment_shader=SHADOW_FS)
        self.skyprog = ctx.program(vertex_shader=SKY_VS, fragment_shader=SKY_FS)
        self.mesh = ctx.buffer(cube_mesh().tobytes())
        self.maxinst = 4000
        self.ibuf = ctx.buffer(reserve=self.maxinst * 24 * 4, dynamic=True)
        self.vao = ctx.vertex_array(self.prog, [
            (self.mesh, "3f 3f 2f 1f", "in_pos", "in_norm", "in_uv", "in_face"),
            (self.ibuf, "16f 3f 3f 2f/i", "i_model", "i_size", "i_color", "i_kind")])
        self.svao = ctx.vertex_array(self.sprog, [
            (self.mesh, "3f 12x 8x 4x", "in_pos"),
            (self.ibuf, "16f 32x/i", "i_model")])
        sky = ctx.buffer(np.array([-1, -1, 3, -1, -1, 3], np.float32).tobytes())
        self.skyvao = ctx.vertex_array(self.skyprog, [(sky, "2f", "in_pos")])
        self.shadow_tex = ctx.depth_texture((2048, 2048))
        self.shadow_tex.compare_func = "<="
        self.shadow_tex.filter = (moderngl.LINEAR, moderngl.LINEAR)
        self.shadow_fbo = ctx.framebuffer(depth_attachment=self.shadow_tex)
        self.msfbo = ctx.framebuffer(color_attachments=[ctx.renderbuffer((W, H), 4, samples=samples)],
                                     depth_attachment=ctx.depth_renderbuffer((W, H), samples=samples))
        self.fbo = ctx.framebuffer(color_attachments=[ctx.renderbuffer((W, H), 4)])

    def render(self, boxes, cam, light, t=0.0):
        ctx = self.ctx
        n = len(boxes)
        arr = np.zeros((n, 24), np.float32)
        for i, (m, size, color, kind, param) in enumerate(boxes):
            arr[i, :16] = m.T.reshape(-1)
            arr[i, 16:19] = size
            arr[i, 19:22] = np.array(color, np.float32) / 255.0
            arr[i, 22] = kind; arr[i, 23] = param
        self.ibuf.write(arr.tobytes())
        eye, target, fov = cam
        V = look_at(eye, target); P = perspective(fov, self.W / self.H)
        VP = P @ V
        sun = np.array(light["sun_dir"], np.float32); sun /= np.linalg.norm(sun)
        center = np.array(target, np.float32)
        lv = look_at(center - sun * 60, center, (0, 1, 0) if abs(sun[1]) < 0.99 else (0, 0, 1))
        LVP = ortho(-35, 35, -35, 35, 1, 140) @ lv
        # sombra
        self.shadow_fbo.use(); self.shadow_fbo.clear(depth=1.0)
        ctx.enable(moderngl.DEPTH_TEST); ctx.disable(moderngl.CULL_FACE)
        self.sprog["u_light_vp"].write(LVP.T.tobytes())
        self.svao.render(instances=n)
        # cena
        self.msfbo.use(); self.msfbo.clear(0, 0, 0, 1, depth=1.0)
        # céu
        ctx.disable(moderngl.DEPTH_TEST)
        sp = VP @ np.array([*(np.array(eye) - sun * 100), 1], np.float32)
        ss = sp[:2] / sp[3] if sp[3] > 0 else np.array([5, 5])
        for k in ("u_sky_top", "u_sky_bot", "u_sun_col"):
            self.skyprog[k].value = tuple(np.array(light[k[2:]], np.float32) / 255.0)
        self.skyprog["u_sun_screen"].value = tuple(map(float, ss))
        self.skyprog["u_aspect"].value = self.W / self.H
        self.skyvao.render()
        ctx.enable(moderngl.DEPTH_TEST)
        pr = self.prog
        pr["u_vp"].write(VP.T.tobytes()); pr["u_light_vp"].write(LVP.T.tobytes())
        pr["u_sun_dir"].value = tuple(map(float, sun))
        for k in ("sun_col", "sky_top", "sky_bot", "amb"):
            pr["u_" + k].value = tuple(np.array(light[k], np.float32) / 255.0)
        pr["u_eye"].value = tuple(map(float, eye)); pr["u_fog"].value = float(light.get("fog", 0.008))
        self.shadow_tex.use(0); pr["u_shadow"].value = 0
        self.vao.render(instances=n)
        ctx.copy_framebuffer(self.fbo, self.msfbo)
        raw = self.fbo.read(components=3, alignment=1)
        img = np.frombuffer(raw, np.uint8).reshape(self.H, self.W, 3)[::-1]
        return img, VP
