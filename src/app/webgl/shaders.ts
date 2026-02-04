// ─── Shared vertex shader (all effects use this) ────────────────────────────
export const VERTEX_SHADER = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main(){
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
}
`

// ─── Shared GLSL helpers (inlined into each fragment shader) ─────────────────
const HELPERS = `
float aastep(float threshold, float value){
    float afwidth = length(vec2(dFdx(value), dFdy(value))) * 0.70710678118654757;
    return smoothstep(threshold - afwidth, threshold + afwidth, value);
}
float median(float r, float g, float b){
    return max(min(r,g), min(max(r,g), b));
}
vec4 fitTexture(sampler2D tex, vec2 imgSize, vec2 ouv, float scale){
    vec2 s = size;
    float rs = size.x / size.y;
    float ri = imgSize.x / imgSize.y;
    vec2 newSize = (rs > ri) ? vec2(size.y*ri, size.y) : vec2(size.x, size.x/ri);
    newSize *= scale;
    vec2 uv2 = (ouv - 0.5) * (s / newSize) + 0.5;
    return texture(tex, uv2);
}
`

// ─── SingleDistord ───────────────────────────────────────────────────────────
export const SINGLE_DISTORD_FS = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
uniform vec3 uColor;
uniform vec3 uBackground;
uniform vec2 size;
uniform vec2 uSizeImage;
uniform float uTime;
uniform float uScale;
uniform float uBarrelStrength;
uniform float uDistortStrength;
in vec2 vUv;
out vec4 FragColor;

${HELPERS}

vec2 barrelPincushion(vec2 uv, float strength){
    vec2 st = uv - 0.5;
    float theta  = atan(st.x, st.y);
    float radius = length(st);
    radius *= 1.0 + strength * (radius * radius);
    return 0.5 + radius * vec2(sin(theta), cos(theta));
}

void main(){
    vec2 uv = barrelPincushion(vUv, uBarrelStrength);
    vec2 distortion = 0.1 * vec2(
        sin(uTime*0.5 + uv.y*1.1 + uv.x*3.5),
        cos(uTime*0.2 + uv.y*2.0 + uv.x*2.0)
    ) * uDistortStrength;
    uv += distortion;
    vec4 tex = fitTexture(uTexture, uSizeImage, uv, uScale);
    float sdf = median(tex.r, tex.g, tex.b);
    float logo = aastep(0.5, sdf);
    FragColor.rgb = mix(uBackground, uColor, logo);
    FragColor.a = 1.0;
}
`

// ─── Grid ────────────────────────────────────────────────────────────────────
export const GRID_FS = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
uniform vec3 uColor;
uniform vec3 uBackground;
uniform vec2 size;
uniform vec2 uSizeImage;
uniform vec2 uRepeat;
uniform float uTime;
uniform float uScale;
uniform float uBarrelStrength;
uniform float uDistortStrength;
in vec2 vUv;
out vec4 FragColor;

${HELPERS}

vec2 barrelPincushion(vec2 uv, float strength){
    vec2 st = uv - 0.5;
    float theta  = atan(st.x, st.y);
    float radius = length(st);
    radius *= 1.0 + strength * (radius * radius);
    return 0.5 + radius * vec2(sin(theta), cos(theta));
}

void main(){
    vec2 uv = barrelPincushion(vUv, uBarrelStrength);
    vec2 distortion = 0.1 * vec2(
        sin(uTime*0.5 + uv.y*1.1 + uv.x*3.5),
        cos(uTime*0.2 + uv.y*2.0 + uv.x*2.0)
    ) * uDistortStrength;
    uv += distortion * 0.3;
    uv *= uRepeat;
    uv  = fract(uv);
    vec4 tex = fitTexture(uTexture, uSizeImage, uv, uScale);
    float sdf = median(tex.r, tex.g, tex.b);
    float logo = aastep(0.5, sdf);
    FragColor.rgb = mix(uBackground, uColor, logo);
    FragColor.a = 1.0;
}
`

// ─── RepeatOverlap ───────────────────────────────────────────────────────────
export const REPEAT_OVERLAP_FS = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
uniform vec3 uColor;
uniform vec3 uBackground;
uniform vec2 size;
uniform vec2 uSizeImage;
uniform float uTime;
uniform float uScale;
uniform float uTimeSpeed;
uniform vec2 uLayerScale;
uniform vec2 uBaseOffset;
uniform vec2 uOffsetSinus;
in vec2 vUv;
out vec4 FragColor;

${HELPERS}

float mapF(float value, float inMin, float inMax, float outMin, float outMax){
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

void main(){
    vec2 uv = vUv;
    float overlapCount = 0.0;
    int count = 20;

    for(int i = 0; i < count; ++i){
        float scaleStep = float(i) / float(count);
        float layerScale = mapF(
            fract(abs(uTime * uTimeSpeed) * uScale + scaleStep),
            0.0, 1.0,
            uLayerScale.x, uLayerScale.y
        );
        vec2 offset = vec2(
            uBaseOffset.x + sin(layerScale * uOffsetSinus.x),
            uBaseOffset.y + sin(layerScale * uOffsetSinus.y)
        );
        vec4 tex = fitTexture(uTexture, uSizeImage, uv + offset, layerScale * 0.3);
        float sdf = median(tex.r, tex.g, tex.b);
        float alpha = aastep(0.5, sdf);
        if(alpha > 0.0){
            overlapCount += 1.0;
        }
    }

    if(mod(overlapCount, 2.0) < 1.0){
        FragColor.rgb = uBackground;
    } else {
        FragColor.rgb = uColor;
    }
    FragColor.a = 1.0;
}
`

// ─── MetaLogo ────────────────────────────────────────────────────────────────
export const META_LOGO_FS = `#version 300 es
precision highp float;
uniform sampler2D uTexture1;
uniform sampler2D uTexture2;
uniform vec2 size;
uniform vec2 uSizeImage;
uniform float uScale;
uniform float uTime;
uniform vec2 uMouse;
uniform float uStrength;
uniform float uSize;
in vec2 vUv;
out vec4 FragColor;

${HELPERS}

float smin3(float a, float b, float k){
    float x = exp(-k * a);
    float y = exp(-k * b);
    return (a*x + b*y) / (x + y);
}
float smax2(float a, float b, float k){
    return smin3(a, b, -k);
}

void main(){
    vec2 uv = vUv;
    float aspect = size.x / size.y;
    vec2 m = uMouse / size;

    float mDist = distance(vec2(m.x, m.y/aspect), vec2(uv.x, uv.y/aspect)) * (24.0 - uSize);

    vec3 msd1 = fitTexture(uTexture1, uSizeImage, uv, uScale).rgb;
    float sd1  = median(msd1.r, msd1.g, msd1.b);
    vec3 msd2 = fitTexture(uTexture2, uSizeImage, uv, uScale).rgb;
    float sd2  = median(msd2.r, msd2.g, msd2.b);

    float i = clamp(mDist, 0.0, 1.0);
    float sdf = sd1 * i + (1.0 - i) * sd2;

    float circle_factor = 51.0 - uStrength;
    float c = 1.0 - mDist;
    float e = smax2(smax2(c, c + sdf, 5.0), sdf, 5.0);
    float f = e * (c / circle_factor) + (1.0 - (c / circle_factor)) * sdf;

    vec3 color = vec3(0.0);
    color.r = aastep(0.5, f);
    FragColor = vec4(color, 1.0);
}
`

// ─── DoubleLogo ──────────────────────────────────────────────────────────────
export const DOUBLE_LOGO_FS = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
uniform vec2 size;
uniform vec2 uSizeImage;
uniform float uScale;
uniform float uTime;
uniform vec2 uMouse;
uniform float uStrength;
uniform float uPosStrength;
in vec2 vUv;
out vec4 FragColor;

${HELPERS}

float circ1(float x){ return  sqrt(1.0 - pow(x - 1.0, 4.0)); }
float circ2(float x){ return 1.0 - sqrt(1.0 - pow(x, 4.0)); }

void main(){
    vec2 m = mix(uMouse / size, vec2(0.5), 1.0 - uPosStrength);
    vec2 st1 = vUv;
    vec2 st2 = vUv;

    st1.x = mix(mix(circ1(st1.x), circ2(st1.x), 1.0 - m.x), vUv.x, 1.0 - uStrength);
    st1.y = mix(mix(circ1(st1.y), circ2(st1.y), 1.0 - m.y), vUv.y, 1.0 - uStrength);
    st2.x = mix(mix(circ1(st2.x), circ2(st2.x),     m.x ), vUv.x, 1.0 - uStrength);
    st2.y = mix(mix(circ1(st2.y), circ2(st2.y),     m.y ), vUv.y, 1.0 - uStrength);

    vec3 msd1 = fitTexture(uTexture, uSizeImage, st1, uScale).rgb;
    vec3 msd2 = fitTexture(uTexture, uSizeImage, st2, uScale).rgb;
    float sd1  = median(msd1.r, msd1.g, msd1.b);
    float sd2  = median(msd2.r, msd2.g, msd2.b);

    vec3 color = vec3(0.0);
    color.rgb = min(vec3(1.0), vec3(aastep(0.5, sd1) + aastep(0.5, sd2)));
    FragColor = vec4(color, 1.0);
}
`

// ─── MouseGrid ───────────────────────────────────────────────────────────────
// Flowmap vertex (WebGL2 but simple passthrough)
export const FLOWMAP_VS = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main(){
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
}
`

export const FLOWMAP_FS = `#version 300 es
precision highp float;
uniform sampler2D tMap;
uniform float uFalloff;
uniform float uAlpha;
uniform float uDissipation;
uniform float uAspect;
uniform vec2 uMouse;
uniform vec2 uVelocity;
in vec2 vUv;
out vec4 FragColor;

void main(){
    vec4 color = texture(tMap, vUv) * uDissipation;
    vec2 cursor = vUv - uMouse;
    cursor.x *= uAspect;
    vec3 stamp = vec3(uVelocity * vec2(1.0, -1.0), 1.0 - pow(1.0 - min(1.0, length(uVelocity)), 3.0));
    float falloff = smoothstep(uFalloff, 0.0, length(cursor)) * uAlpha;
    color.rgb = mix(color.rgb, stamp, vec3(falloff));
    FragColor = color;
}
`

export const MOUSE_GRID_FS = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
uniform sampler2D tFlow;
uniform vec3 uColor;
uniform vec3 uBackground;
uniform vec2 uSizeImage;
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 size;
uniform float uGridSize;
uniform vec2 uMouse;
uniform float uScale;
in vec2 vUv;
out vec4 FragColor;

${HELPERS}

void main(){
    vec2 uv = vUv;
    float blocks = uGridSize * uResolution.x * 0.001;
    float x = floor(uv.x * blocks) / blocks;
    float y = floor(uv.y * blocks) / blocks;
    vec2 flowUv = vec2(x, y);

    vec3 flow = texture(tFlow, flowUv).rgb;
    float distanceToCenter = 1.0 - distance(vUv, uMouse);
    vec2 textureUv = vUv;
    textureUv -= flow.rg * distanceToCenter;

    vec4 logo = fitTexture(uTexture, uSizeImage, textureUv, uScale);
    float alpha = aastep(0.5, median(logo.r, logo.g, logo.b));

    vec3 color = mix(uColor, uBackground, alpha);
    FragColor.rgb = color;
    FragColor.a   = 1.0;
}
`
