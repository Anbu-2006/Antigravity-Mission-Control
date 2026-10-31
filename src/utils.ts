import { DEFAULT_USER_STATUS_TEMPLATE_B64 } from './userStatusTemplate';

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
        'claude-sonnet-4-6': 'Claude Sonnet 4.6 (Thinking)',
        'claude-opus-4.6': 'Claude Opus 4.6 (Thinking)',
        'claude-opus-4-6-thinking': 'Claude Opus 4.6 (Thinking)',
        'claude-opus-5.5': 'Claude Opus 5.5 (Thinking)',
        'claude-opus-5-5': 'Claude Opus 5.5 (Thinking)',
        'claude-opus-5-5-thinking': 'Claude Opus 5.5 (Thinking)',
        'claude-sonnet-5.5': 'Claude Sonnet 5.5 (Thinking)',
        'claude-sonnet-5-5': 'Claude Sonnet 5.5 (Thinking)',
        'claude-sonnet-5-5-thinking': 'Claude Sonnet 5.5 (Thinking)',
        'gpt-oss-120b-medium': 'GPT-OSS 120B (Medium)'
    };

    if (directMap[lower]) {
        return directMap[lower];
    }

    let formatted = n;
    if (lower.startsWith('gemini')) {
        const normalized = n.replace(/gemini-(\d+)-(\d+)/i, 'gemini-$1.$2');
        const parts = normalized.split('-');
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
        const normalized = n.replace(/claude-(opus|sonnet|haiku)-(\d+)-(\d+)/i, 'claude-$1-$2.$3')
                            .replace(/claude-(\d+)-(\d+)/i, 'claude-$1.$2');
        const parts = normalized.split('-');
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

/**
 * Sanitizes and extracts refresh tokens from raw input
 * - Strips invisible zero-width unicode characters (\u200B, \uFEFF, \u00A0, etc.)
 * - Decodes URL-encoded refresh tokens (e.g. 1%2F%2F...)
 * - Removes surrounding single/double/smart quotes
 * - Extracts token from JSON snippets (e.g., {"refresh_token": "..."})
 * - Strips all internal whitespace, newlines, and trailing commas
 */
export function cleanRefreshToken(input: string): string {
    if (!input) { return ''; }
    let str = input.trim();

    // 1. Strip invisible / zero-width characters
    str = str.replace(/[\u200B-\u200D\uFEFF\u00A0\u2060\u180E]/g, '');

    // 2. Decode URL encoding if token was encoded
    if (str.includes('%2F') || str.includes('%2f')) {
        try { str = decodeURIComponent(str); } catch (e) {}
    }

    // 3. Extract JSON if token wrapped in JSON object or snippet
    if (str.includes('{') || str.includes('refresh_token')) {
        try {
            const parsed = JSON.parse(str);
            if (typeof parsed.refresh_token === 'string') {
                str = parsed.refresh_token;
            } else if (Array.isArray(parsed.accounts) && parsed.accounts[0]?.refresh_token) {
                str = parsed.accounts[0].refresh_token;
            }
        } catch {
            const match = str.match(/"refresh_token"\s*:\s*"([^"]+)"/);
            if (match) {
                str = match[1];
            }
        }
    }

    // 4. Remove smart/curly quotes (“ ” ‘ ’) and standard quotes (' " `)
    str = str.replace(/^["'`\u201c\u201d\u2018\u2019]+|["'`\u201c\u201d\u2018\u2019]+$/g, '');

    // 5. Strip all internal whitespace, newlines, carriage returns, tabs
    str = str.replace(/\s+/g, '');

    // 6. Strip trailing comma or semicolons
    str = str.replace(/[,;]+$/, '');

    return str;
}

export function encodeLenDelim(fieldNum: number, data: Buffer): Buffer {
    const tag = (fieldNum << 3) | 2;
    return Buffer.concat([encodeVarint(tag), encodeVarint(data.length), data]);
}

export function encodeStringField(fieldNum: number, value: string): Buffer {
    return encodeLenDelim(fieldNum, Buffer.from(value, 'utf-8'));
}

/**
 * Constructs or updates the Base64 UserStatus protobuf for antigravityUnifiedStateSync.userStatus
 * Sets:
 *  - Field 3 (string): Account Name
 *  - Field 7 (string): Account Email
 *  - Field 38 (string, optional): Account Avatar URL
 * Preserves all underlying 19 model config mappings, mime types, and Google AI Plus (g1-plus-tier) definitions.
 */
export function buildUserStatusB64(name: string, email: string, avatarUrl?: string, existingOuterB64?: string): string {
    let baseInnerBuf: Buffer;
    if (existingOuterB64) {
        try {
            const outerBuf = Buffer.from(existingOuterB64, 'base64');
            let off = 0;
            let innerB64: string | null = null;
            while (off < outerBuf.length) {
                const [tag, off1] = readVarint(outerBuf, off);
                const wire = tag & 7;
                if (wire === 2) {
                    const [len, off2] = readVarint(outerBuf, off1);
                    const sub = outerBuf.subarray(off2, off2 + len);
                    let subOff = 0, k = '', v = '';
                    while (subOff < sub.length) {
                        const [sTag, sOff1] = readVarint(sub, subOff);
                        const sFn = sTag >> 3;
                        const [sLen, sOff2] = readVarint(sub, sOff1);
                        if (sFn === 1) k = sub.subarray(sOff2, sOff2 + sLen).toString('utf-8');
                        if (sFn === 2) {
                            let vOff = 0;
                            while (vOff < sLen) {
                                const [vTag, vOff1] = readVarint(sub, sOff2 + vOff);
                                const [vLen, vOff2] = readVarint(sub, vOff1);
                                v = sub.subarray(vOff2, vOff2 + vLen).toString('utf-8');
                                vOff = (vOff2 + vLen) - sOff2;
                            }
                        }
                        subOff = sOff2 + sLen;
                    }
                    if (k === 'userStatusSentinelKey') {
                        innerB64 = v;
                        break;
                    }
                    off = off2 + len;
                } else if (wire === 0) {
                    const [, off2] = readVarint(outerBuf, off1);
                    off = off2;
                } else {
                    off = off1 + 8;
                }
            }
            if (innerB64) {
                baseInnerBuf = Buffer.from(innerB64, 'base64');
            } else {
                baseInnerBuf = Buffer.from(DEFAULT_USER_STATUS_TEMPLATE_B64, 'base64');
            }
        } catch {
            baseInnerBuf = Buffer.from(DEFAULT_USER_STATUS_TEMPLATE_B64, 'base64');
        }
    } else {
        baseInnerBuf = Buffer.from(DEFAULT_USER_STATUS_TEMPLATE_B64, 'base64');
    }

    let cleanInner = removeField(baseInnerBuf, 3); // Remove previous name
    cleanInner = removeField(cleanInner, 7); // Remove previous email
    cleanInner = removeField(cleanInner, 38); // Remove previous avatar URL

    const nameField = encodeStringField(3, name);
    const emailField = encodeStringField(7, email);
    let updatedInner = Buffer.concat([cleanInner, nameField, emailField]);
    if (avatarUrl && avatarUrl.trim()) {
        updatedInner = Buffer.concat([updatedInner, encodeStringField(38, avatarUrl.trim())]);
    }

    const updatedInnerB64 = updatedInner.toString('base64');
    const innerMsg2 = encodeStringField(1, updatedInnerB64);
    const innerMsg1 = encodeStringField(1, "userStatusSentinelKey");
    const innerMsg = Buffer.concat([innerMsg1, encodeLenDelim(2, innerMsg2)]);
    const finalOuter = encodeLenDelim(1, innerMsg);
    return finalOuter.toString('base64');
}
