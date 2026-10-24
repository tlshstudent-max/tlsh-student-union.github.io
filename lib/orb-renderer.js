// An analytic sphere and refracted badge: no network textures, library or idle render loop.
const vertex = `
attribute vec2 aPosition;
varying vec2 vPosition;
void main() { vPosition = aPosition * 1.12; gl_Position = vec4(aPosition, 0.0, 1.0); }
`;
const fragment = `
precision highp float;
varying vec2 vPosition;
uniform sampler2D uBadge;
uniform mat3 uInverseRotation;
uniform float uLight;
uniform float uSolid;
void main() {
    vec2 p = vPosition;
    float rr = dot(p, p);
    if (rr >= 1.0) { gl_FragColor = vec4(0.0); return; }
    vec3 n = vec3(p, sqrt(1.0 - rr));
    vec3 view = vec3(0.0, 0.0, -1.0);
    vec3 ray = refract(view, n, 1.0 / 1.33);
    vec3 localOrigin = uInverseRotation * n;
    vec3 localRay = uInverseRotation * ray;
    float t = -localOrigin.z / (abs(localRay.z) > 0.001 ? localRay.z : 0.001);
    float exitDistance = -2.0 * dot(n, ray);
    vec2 badgePoint = (localOrigin + t * localRay).xy / 0.68;
    float badgeCoverage = 1.0 - smoothstep(0.98, 1.0, length(badgePoint));
    if (t < 0.0 || t > exitDistance || abs(localRay.z) < 0.015) badgeCoverage = 0.0;
    vec3 ink = texture2D(uBadge, badgePoint * 0.5 + 0.5).rgb;
    vec3 reflection = reflect(view, n);
    float softbox = pow(max(dot(reflection, normalize(vec3(-0.48, 0.64, 0.70))), 0.0), 34.0);
    float strip = pow(max(dot(reflection, normalize(vec3(0.75, -0.14, 0.72))), 0.0), 100.0);
    float fresnel = 0.025 + 0.975 * pow(1.0 - n.z, 4.4);
    float rim = pow(1.0 - n.z, 2.0);
    vec3 glass = mix(vec3(0.70, 0.79, 0.80), vec3(0.88, 0.93, 0.92), uLight);
    glass = mix(glass, vec3(0.96, 0.94, 0.82), rim * 0.35);
    float alpha = 0.07 + fresnel * 0.48 + rim * 0.08;
    vec3 color = mix(glass, ink * 0.95 + vec3(0.025), badgeCoverage);
    alpha = mix(alpha, 0.97, badgeCoverage);
    float ribbon = exp(-pow((p.x + 0.36) / 0.085, 2.0) - pow((p.y - 0.54) / 0.22, 2.0));
    float arc = pow(max(dot(normalize(p + vec2(0.0001)), normalize(vec2(-0.7, 0.9))), 0.0), 18.0) * pow(rim, 0.35);
    color = mix(color, vec3(1.0), min(0.9, softbox * 0.44 + strip * 0.45 + ribbon * 0.60 + arc * 0.35));
    alpha = min(1.0, alpha + softbox * 0.3 + strip * 0.2 + ribbon * 0.2 + arc * 0.18);
    color += vec3(0.10, 0.12, 0.12) * pow(rim, 4.0);
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
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.uniform1i(gl.getUniformLocation(program, 'uBadge'), 0);
        const rotation = gl.getUniformLocation(program, 'uInverseRotation'), light = gl.getUniformLocation(program, 'uLight'), solid = gl.getUniformLocation(program, 'uSolid');
        return {
            render(yaw, pitch, lightMode, solidMode) {
                const size = Math.min(768, Math.round(canvas.getBoundingClientRect().width * Math.min(devicePixelRatio || 1, 1.75)));
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
