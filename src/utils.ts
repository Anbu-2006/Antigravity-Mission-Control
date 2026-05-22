export function encodeVarint(value: number): Buffer {
    const buf: number[] = [];
    let v = value;
    while (v >= 0x80) {
        buf.push((v & 0x7F) | 0x80);
        v >>= 7;
    }
    buf.push(v);
    return Buffer.from(buf);
}

export function readVarint(data: Buffer, offset: number): [number, number] {
    let result = 0;
    let shift = 0;
    let pos = offset;

    while (true) {
        if (pos >= data.length) {
            throw new Error("Data incomplete");
        }
        const byte = data[pos];
        result |= (byte & 0x7F) << shift;
        pos += 1;
        if ((byte & 0x80) === 0) {
            break;
        }
        shift += 7;
    }

    return [result, pos];
}

export function skipField(data: Buffer, offset: number, wireType: number): number {
    if (wireType === 0) { // Varint
        const [, newOffset] = readVarint(data, offset);
        return newOffset;
    } else if (wireType === 1) { // 64-bit
        return offset + 8;
    } else if (wireType === 2) { // Length-delimited
        const [length, contentOffset] = readVarint(data, offset);
        return contentOffset + length;
    } else if (wireType === 5) { // 32-bit
        return offset + 4;
    } else {
        throw new Error(`Unknown wireType: ${wireType}`);
    }
}

export function removeField(data: Buffer, fieldNum: number): Buffer {
    let result = Buffer.alloc(0);
    let offset = 0;

    while (offset < data.length) {
        const startOffset = offset;
        const [tag, newOffset] = readVarint(data, offset);
        const wireType = tag & 7;
        const currentField = tag >> 3;

        if (currentField === fieldNum) {
            offset = skipField(data, newOffset, wireType);
        } else {
            const nextOffset = skipField(data, newOffset, wireType);
            result = Buffer.concat([result, data.subarray(startOffset, nextOffset)]);
            offset = nextOffset;
        }
    }

    return result;
}

export function getModelDisplayName(name: string): string {
    if (!name) { return ''; }
    const n = name.trim();
    const lower = n.toLowerCase();

    // Direct mapping dictionary for known models
    const directMap: Record<string, string> = {
        'gemini-3-flash': 'Gemini 3 Flash',
        'gemini-3-flash-agent': 'Gemini 3 Flash (Agent)',
        'gemini-3.1-flash-image': 'Gemini 3.1 Flash (Image)',
        'gemini-3.1-flash-lite': 'Gemini 3.1 Flash (Lite)',
        'gemini-3.1-pro-high': 'Gemini 3.1 Pro (High)',
        'gemini-3.1-pro-low': 'Gemini 3.1 Pro (Low)',
        'gemini-3.5-flash-low': 'Gemini 3.5 Flash (Low)',
        'gemini-3.5-flash-medium': 'Gemini 3.5 Flash (Medium)',
        'gemini-3.5-flash-high': 'Gemini 3.5 Flash (High)',
        'gemini-pro-agent': 'Gemini Pro (Agent)',
        'claude-sonnet-4.6': 'Claude Sonnet 4.6 (Thinking)',
        'claude-opus-4.6': 'Claude Opus 4.6 (Thinking)',
        'gpt-oss-120b-medium': 'GPT-OSS 120B (Medium)'
    };

    if (directMap[lower]) {
        return directMap[lower];
    }

    let formatted = n;
    if (lower.startsWith('gemini')) {
        const parts = n.split('-');
        const capParts = parts.map((part, idx) => {
            if (idx === 0) { return 'Gemini'; }
            if (part.toLowerCase() === 'pro') { return 'Pro'; }
            if (part.toLowerCase() === 'flash') { return 'Flash'; }
            if (part.toLowerCase() === 'agent') { return '(Agent)'; }
            if (part.toLowerCase() === 'image') { return '(Image)'; }
            if (part.toLowerCase() === 'lite') { return '(Lite)'; }
            if (part.toLowerCase() === 'high') { return '(High)'; }
            if (part.toLowerCase() === 'medium') { return '(Medium)'; }
            if (part.toLowerCase() === 'low') { return '(Low)'; }
            if (/^\d+(\.\d+)?$/.test(part)) { return part; }
            return part.charAt(0).toUpperCase() + part.slice(1);
        });
        formatted = capParts.join(' ')
            .replace(/\s+\(/g, ' (')
            .replace(/\s+/g, ' ');
    } else if (lower.startsWith('claude')) {
        const parts = n.split('-');
        const capParts = parts.map((part, idx) => {
            if (idx === 0) { return 'Claude'; }
            if (part.toLowerCase() === 'sonnet') { return 'Sonnet'; }
            if (part.toLowerCase() === 'opus') { return 'Opus'; }
            if (part.toLowerCase() === 'haiku') { return 'Haiku'; }
            if (part.toLowerCase() === 'thinking') { return '(Thinking)'; }
            if (/^\d+(\.\d+)?$/.test(part)) { return part; }
            return part.charAt(0).toUpperCase() + part.slice(1);
        });
        formatted = capParts.join(' ')
            .replace(/\s+\(/g, ' (')
            .replace(/\s+/g, ' ');
    } else if (lower.startsWith('gpt')) {
        const parts = n.split('-');
        const capParts = parts.map((part, idx) => {
            if (idx === 0) { return 'GPT'; }
            if (part.toUpperCase() === 'OSS') { return 'OSS'; }
            if (part.toLowerCase() === 'medium') { return '(Medium)'; }
            if (part.toLowerCase() === 'high') { return '(High)'; }
            if (part.toLowerCase() === 'low') { return '(Low)'; }
            if (/^\d+[a-zA-Z]*$/.test(part)) { return part.toUpperCase(); }
            return part.charAt(0).toUpperCase() + part.slice(1);
        });
        formatted = capParts.join(' ')
            .replace(/\s+\(/g, ' (')
            .replace(/\s+/g, ' ');
    }
    return formatted;
}
