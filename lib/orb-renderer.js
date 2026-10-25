import { createLetterField } from './orb-lettering.js?v=gallery-1';
// Refracted rays intersect solid, beveled letter volumes suspended inside the glass.
const vertex = `
attribute vec2 aPosition;
varying vec2 vPosition;
void main() { vPosition = aPosition * 1.12; gl_Position = vec4(aPosition, 0.0, 1.0); }
`;
const fragment = `
precision highp float;
varying vec2 vPosition;
uniform sampler2D uLetters;
uniform mat3 uInverseRotation;
uniform float uLight;
uniform float uSolid;
float letterDistance(vec3 point) {
    vec4 encoded = texture2D(uLetters, point.xy / vec2(1.6, 1.075) + 0.5);
    float face = (encoded.r * (256.0 / 257.0) + encoded.a * (1.0 / 257.0) - 0.5) * 0.32;
    vec2 edge = abs(point.xy) - vec2(0.80, 0.5375);
    face = max(face, max(edge.x, edge.y));
    float depth = mix(0.085, 0.13, step(-0.12, point.y));
    vec2 d = vec2(face, abs(point.z) - depth);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - 0.006;
}
vec2 letterBounds(vec3 origin, vec3 direction) {
    vec3 safe = mix(vec3(0.00001), direction, step(vec3(0.00001), abs(direction)));
    vec3 a = (-vec3(0.80, 0.5375, 0.18) - origin) / safe;
    vec3 b = (vec3(0.80, 0.5375, 0.18) - origin) / safe;
    vec3 lo = min(a, b), hi = max(a, b);
    return vec2(max(max(lo.x, lo.y), lo.z), min(min(hi.x, hi.y), hi.z));
}
vec3 letterNormal(vec3 point) {
    // Average across several field texels for a polished sidewall, rather than
    // reflecting each raster stair-step in the original hand-drawn lettering.
    const float e = 0.012;
    return normalize(vec3(
        letterDistance(point + vec3(e,0.0,0.0)) - letterDistance(point - vec3(e,0.0,0.0)),
        letterDistance(point + vec3(0.0,e,0.0)) - letterDistance(point - vec3(0.0,e,0.0)),
        letterDistance(point + vec3(0.0,0.0,e)) - letterDistance(point - vec3(0.0,0.0,e))
    ));
}
void main() {
    vec2 p = vPosition;
    float rr = dot(p, p);
    if (rr >= 1.0) { gl_FragColor = vec4(0.0); return; }
    vec3 n = vec3(p, sqrt(1.0 - rr));
    vec3 view = vec3(0.0, 0.0, -1.0);
    vec3 ray = refract(view, n, 1.0 / 1.33);
    // Leave clear glass around the sculpture, including at oblique angles.
    const float sculptureScale = 0.78;
    vec3 localOrigin = uInverseRotation * n / sculptureScale;
    vec3 localRay = uInverseRotation * ray / sculptureScale;
    float exitDistance = -2.0 * dot(n, ray);
    vec2 bounds = letterBounds(localOrigin, localRay);
    float t = max(0.0, bounds.x), end = min(exitDistance, bounds.y);
    float coverage = 0.0;
    vec3 ink = vec3(0.05, 0.075, 0.17);
    if (end > t) {
        for (int stepIndex = 0; stepIndex < 88; stepIndex++) {
            vec3 point = localOrigin + localRay * t;
            float distance = letterDistance(point);
            if (distance < 0.0016) {
                vec3 localNormal = letterNormal(point);
                vec3 normal = normalize(vec3(dot(uInverseRotation[0],localNormal), dot(uInverseRotation[1],localNormal), dot(uInverseRotation[2],localNormal)));
                vec3 key = normalize(vec3(-0.22,0.92,0.85));
                float diffuse = max(dot(normal,key),0.0);
                float faceNormal = abs(localNormal.z);
                float front = pow(faceNormal,4.0);
                float bevel = smoothstep(0.12,0.3,faceNormal) * (1.0 - smoothstep(0.8,0.98,faceNormal));
                vec3 sideColor = mix(vec3(0.32,0.39,0.51),vec3(0.20,0.25,0.36),uLight);
                vec3 faceColor = mix(vec3(0.43,0.51,0.66),vec3(0.045,0.065,0.16),uLight);
                vec3 material = mix(sideColor,faceColor,front);
                material = mix(material,vec3(0.55,0.51,0.40),bevel * 0.16);
                vec3 halfVector = normalize(key - ray);
                float specular = pow(max(dot(normal,halfVector),0.0),48.0);
                ink = material * (0.66 + 0.48 * diffuse) + vec3(0.96,0.94,0.87) * specular * mix(0.23,0.13,front);
                coverage = 1.0; break;
            }
            t += max(0.001, distance * 0.65);
            if (t > end) break;
        }
    }
    vec3 reflection = reflect(view, n);
    float softbox = pow(max(dot(reflection, normalize(vec3(-0.28, 0.85, 0.72))), 0.0), 25.0);
    float strip = pow(max(dot(reflection, normalize(vec3(0.80, -0.30, 0.65))), 0.0), 72.0);
    float fresnel = pow(1.0 - n.z, 4.4);
    float rim = pow(1.0 - n.z, 2.0);
    vec3 glass = mix(vec3(0.67, 0.74, 0.77), vec3(0.58, 0.65, 0.65), uLight);
    float alpha = 0.018 + fresnel * 0.22 + rim * 0.045;
    vec3 color = mix(glass, ink, coverage);
    alpha = mix(alpha, 1.0, coverage);
    float ribbon = exp(-pow((p.x + 0.38) / 0.09, 2.0) - pow((p.y - 0.63) / 0.20, 2.0));
    float arc = pow(max(dot(normalize(p + vec2(0.0001)), normalize(vec2(-0.55, 0.95))), 0.0), 12.0) * pow(rim, 0.35);
    float foot = pow(max(dot(normalize(p + vec2(0.0001)), normalize(vec2(0.55, -0.85))), 0.0), 22.0) * pow(rim, 0.55);
    float highlight = min(0.92, softbox * 0.66 + strip * 0.50 + ribbon * 0.5 + arc * 0.72 + foot * 0.48);
    color = mix(color, vec3(1.0,0.985,0.94), highlight);
    alpha = min(1.0, alpha + softbox * 0.38 + strip * 0.26 + ribbon * 0.14 + arc * 0.38 + foot * 0.24);
    alpha = mix(alpha, 1.0, uSolid);
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), alpha * (1.0 - smoothstep(0.991, 1.0, rr)));
}
`;

export function createOrbRenderer(canvas, image) {
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: true, powerPreference: 'low-power' });
    if (!gl) return null;
    const resources = [];
    const shader = (type, source) => {
        const value = gl.createShader(type); resources.push(['Shader', value]);
        gl.shaderSource(value, source); gl.compileShader(value);
        if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error('Shader unavailable');
        return value;
    };
    const dispose = () => { for (const [type, value] of resources) gl[`delete${type}`](value); };
    try {
        const field = createLetterField(image);
        const program = gl.createProgram(); resources.push(['Program', program]);
        gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex)); gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Renderer unavailable');
        gl.useProgram(program);
        const buffer = gl.createBuffer(); resources.push(['Buffer', buffer]);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, 'aPosition'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        const texture = gl.createTexture(); resources.push(['Texture', texture]);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA, field.width, field.height, 0, gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, field.data);
        gl.uniform1i(gl.getUniformLocation(program, 'uLetters'), 0);
        const rotation = gl.getUniformLocation(program, 'uInverseRotation'), light = gl.getUniformLocation(program, 'uLight'), solid = gl.getUniformLocation(program, 'uSolid');
        return {
            render(yaw, pitch, lightMode, solidMode) {
                const size = Math.min(640, Math.round(canvas.getBoundingClientRect().width * Math.min(devicePixelRatio || 1, 1.5)));
                if (size < 1 || gl.isContextLost()) return;
                if (canvas.width !== size || canvas.height !== size) canvas.width = canvas.height = size;
                gl.viewport(0, 0, size, size);
                const y = Math.cos(yaw), sy = Math.sin(yaw), x = Math.cos(pitch), sx = Math.sin(pitch);
                gl.uniformMatrix3fv(rotation, false, new Float32Array([y,sy*sx,sy*x,0,x,-sx,-sy,y*sx,y*x]));
                gl.uniform1f(light, lightMode ? 1 : 0); gl.uniform1f(solid, solidMode ? 1 : 0);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
            }, dispose,
        };
    } catch {
        dispose(); return null;
    }
}
