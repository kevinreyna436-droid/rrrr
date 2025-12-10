
// Modelos especiales que usan prefijo 'C'
const C_PREFIX_MODELS = ['CIGAR', 'VADA', 'MISHA', 'SPROUT', 'ARQUETTE'];

// Variaciones comunes del nombre del proveedor para detección
const FORMATEX_ALIASES = ['formatex', 'fotmatex', 'fromatex', 'creata'];

export const isFormatexSupplier = (supplierName: string): boolean => {
    if (!supplierName) return false;
    const lower = supplierName.toLowerCase();
    return FORMATEX_ALIASES.some(alias => lower.includes(alias));
};

export const generateFormatexSKU = (modelName: string, colorName: string): string => {
    if (!modelName || !colorName) return 'N/A';

    // 1. Normalize strings (Uppercase, remove non-alpha characters to handle spaces/hyphens safely)
    const cleanModel = modelName.toUpperCase().replace(/[^A-Z]/g, '');
    const cleanColor = colorName.toUpperCase().replace(/[^A-Z]/g, '');

    if (cleanModel.length < 1 || cleanColor.length < 1) return 'ERROR';

    // 2. Determine Prefix
    // Check if the cleaned model name starts with any of the special collection names
    const prefix = C_PREFIX_MODELS.some(special => cleanModel.startsWith(special)) ? 'C' : 'L';

    // 3. Extract Parts
    const modelPart = cleanModel.slice(0, 4).padEnd(4, 'X'); // Pad with X if name is too short (rare)
    const colorPart = cleanColor.slice(0, 3).padEnd(3, 'X');

    // 4. Combine
    return `${prefix}${modelPart}${colorPart}`;
};
