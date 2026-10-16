export const base64_to_bytes = (b64: string): Uint8Array<ArrayBuffer> => {
    const binary_string = atob(b64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes;
}

export const bytes_to_base64 = (bytes: Uint8Array): string => {
    let binary_string = "";
    for (let i = 0; i < bytes.length; i++) {
        binary_string += String.fromCharCode(bytes[i]);
    }
    return btoa(binary_string);
}

export const sha256_str = async (text: string): Promise<ArrayBuffer> => {
    const data = new TextEncoder().encode(text);
    return await crypto.subtle.digest("SHA-256", data);
}
