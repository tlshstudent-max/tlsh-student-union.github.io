// Preserve the hand-drawn letter shapes; the circular paper, stars and red ornaments
// are not part of the interactive sculpture. The official source badge stays unchanged.
export const lettering = { width: 512, height: 344, span: 1.6, range: .16 };

export function navyMask(pixels) {
    const mask = new Uint8Array(pixels.length / 4);
    for (let i = 0; i < mask.length; i++) {
        const r = pixels[i * 4], g = pixels[i * 4 + 1], b = pixels[i * 4 + 2], a = pixels[i * 4 + 3];
        const navy = r < 110 && g < 115 && b > 12 && b > r * 1.18 && b > g * 1.18;
        const darkInk = r < 50 && g < 55 && b < 100 && b >= r * .9 && b >= g * .9;
        mask[i] = a > 128 && (navy || darkInk) ? 1 : 0;
    }
    return mask;
}

// The central lettering is wholly inside the crop. Ink connected to its border
// belongs to the surrounding stars or badge edge, not to an isolated letter dot.
export function clearCropEdges(mask, width, height) {
    const pending = [];
    function visit(x, y) {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const i = y * width + x;
        if (mask[i]) { mask[i] = 0; pending.push(i); }
    }
    for (let x = 0; x < width; x++) { visit(x, 0); visit(x, height - 1); }
    for (let y = 0; y < height; y++) { visit(0, y); visit(width - 1, y); }
    while (pending.length) {
        const i = pending.pop(), x = i % width, y = Math.floor(i / width);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) visit(x + dx, y + dy);
    }
    return mask;
}

// Exact squared Euclidean distance transform, two linear-time passes.
function distances(mask, width, height, value) {
    const result = new Float64Array(mask.length), work = new Float64Array(Math.max(width, height));
    const vertices = new Int32Array(work.length), borders = new Float64Array(work.length + 1), line = new Float64Array(work.length);
    function transform(count) {
        let k = 0; vertices[0] = 0; borders[0] = -Infinity; borders[1] = Infinity;
        for (let q = 1; q < count; q++) {
            let at = vertices[k], cut = ((work[q] + q * q) - (work[at] + at * at)) / (2 * (q - at));
            while (k > 0 && cut <= borders[k]) { k--; at = vertices[k]; cut = ((work[q] + q * q) - (work[at] + at * at)) / (2 * (q - at)); }
            k++; vertices[k] = q; borders[k] = cut; borders[k + 1] = Infinity;
        }
        k = 0;
        for (let q = 0; q < count; q++) { while (borders[k + 1] < q) k++; line[q] = (q - vertices[k]) ** 2 + work[vertices[k]]; }
    }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) work[x] = mask[y * width + x] === value ? 0 : 1e10;
        transform(width); result.set(line.subarray(0, width), y * width);
    }
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) work[y] = result[y * width + x];
        transform(height); for (let y = 0; y < height; y++) result[y * width + x] = line[y];
    }
    return result;
}

export function signedLetterField(mask, width, height, span = lettering.span, range = lettering.range, levels = 255) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || mask.length !== width * height || !Number.isFinite(span) || span <= 0 || !Number.isFinite(range) || range <= 0) throw new Error('Invalid lettering dimensions');
    if (levels !== 255 && levels !== 65535) throw new Error('Invalid lettering precision');
    const ink = distances(mask, width, height, 1), empty = distances(mask, width, height, 0), data = levels === 65535 ? new Uint16Array(mask.length) : new Uint8Array(mask.length);
    for (let i = 0; i < data.length; i++) {
        const distance = (Math.sqrt(ink[i]) - Math.sqrt(empty[i])) * span / width;
        data[i] = Math.round(Math.max(0, Math.min(1, .5 + distance / (2 * range))) * levels);
    }
    return data;
}

export function createLetterField(image) {
    const { width, height } = lettering;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Lettering unavailable');
    // Normalized crop from the official 939px square badge: central TLSH and Chinese line.
    context.drawImage(image, image.naturalWidth * .12, image.naturalHeight * .36, image.naturalWidth * .76, image.naturalHeight * .51, 0, 0, width, height);
    const mask = navyMask(context.getImageData(0, 0, width, height).data);
    // Exclude the distant charcoal circle edge, even where it enters a crop corner.
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const sourceX = .12 + (x + .5) / width * .76, sourceY = .36 + (y + .5) / height * .51;
        if (Math.hypot(sourceX - .5, sourceY - .5) > .475) mask[y * width + x] = 0;
    }
    clearCropEdges(mask, width, height);
    if (mask.reduce((sum, value) => sum + value, 0) < 100) throw new Error('Lettering unavailable');
    const field = signedLetterField(mask, width, height, lettering.span, lettering.range, 65535), data = new Uint8Array(field.length * 2);
    // Pack 16-bit distances into two linearly filtered 8-bit channels. This avoids
    // striped sidewall normals without requiring floating-point texture extensions.
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const value = field[y * width + x], target = ((height - 1 - y) * width + x) * 2;
        data[target] = value >> 8; data[target + 1] = value & 255;
    }
    return { width, height, data };
}
