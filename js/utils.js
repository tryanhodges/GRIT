/**
 * @file utils.js
 * @description Contains generic, reusable helper functions used throughout the application.
 */

/**
 * A shorthand for document.getElementById.
 * @param {string} id The ID of the element to get.
 * @returns {HTMLElement}
 */
export const getEl = (id) => document.getElementById(id);

/**
 * Converts a string to Title Case.
 * @param {string} str The string to convert.
 * @returns {string}
 */
export function toTitleCase(str) {
    if (!str) return '';
    return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

/**
 * Reads a file as text.
 * @param {File} file The file to read.
 * @returns {Promise<string>} A promise that resolves with the file content.
 */
export function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(e);
        reader.readAsText(file);
    });
}

/**
 * Triggers a browser download for the given content.
 * @param {string} content The content to download.
 * @param {string} fileName The name of the file.
 */
export function downloadFile(content, fileName) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
}

/**
 * Generates a unique filename with a timestamp and user initials.
 * @param {string} baseName The base name for the file.
 * @param {string} userInitials The initials of the user.
 * @returns {string}
 */
export function generateUniqueFilename(baseName, userInitials) {
    const now = new Date();
    const date = `${(now.getMonth() + 1).toString().padStart(2, '0')}${(now.getDate()).toString().padStart(2, '0')}${now.getFullYear()}`;
    const time = `${(now.getHours()).toString().padStart(2, '0')}${(now.getMinutes()).toString().padStart(2, '0')}`;
    const initials = userInitials ? ` ${userInitials}` : '';
    return `${baseName} ${date} ${time}${initials}.csv`;
}

/**
 * Generates a CSV string from the slotted items data.
 * @param {object} slottedItems The final slotted data.
 * @returns {string}
 */
export function generateCSV(slottedItems) {
    // Use \r\n for better compatibility with Excel
    let csv = "UniqueID,Brand,Model,Size,Color,LocationID,Type,Sex,OriginalItemString\r\n";
    Object.entries(slottedItems)
        .sort(([locA], [locB]) => locA.localeCompare(locB, undefined, {numeric: true}))
        .forEach(([loc, item]) => {
            const originalItemString = `"${(item.OriginalItemString || '').replace(/"/g, '""')}"`;
            csv += `"${item.UniqueID||''}","${item.Brand||''}","${item.Model||''}","${item.Size||''}","${item.Color||''}",${loc},"${item.Type||''}","${item.Sex||''}",${originalItemString}\r\n`;
        });
    return csv;
}

/**
 * A more robust CSV parser that handles quoted fields, different line endings, BOM, and smart quotes.
 * @param {string} csvText The CSV text to parse.
 * @returns {Array<Array<string>>}
 */
export function robustCSVParse(csvText) {
    // Sanitize input text first
    if (csvText.charCodeAt(0) === 0xFEFF) {
        csvText = csvText.slice(1); // Remove BOM
    }
    csvText = csvText.replace(/[\u201C\u201D\u201E]/g, '"'); // Normalize smart quotes
    csvText = csvText.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n'); // Normalize line endings

    const result = [];
    let currentRow = [];
    let currentField = '';
    let inQuotedField = false;

    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];

        if (inQuotedField) {
            if (char === '"') {
                // Check for an escaped quote ("")
                if (i + 1 < csvText.length && csvText[i + 1] === '"') {
                    currentField += '"';
                    i++; // Skip the next quote
                } else {
                    inQuotedField = false; // End of quoted field
                }
            } else {
                currentField += char; // Character inside a quoted field
            }
        } else {
            switch (char) {
                case ',':
                    currentRow.push(currentField);
                    currentField = '';
                    break;
                case '\n':
                    currentRow.push(currentField);
                    result.push(currentRow);
                    currentRow = [];
                    currentField = '';
                    break;
                case '"':
                    // A quote signifies the start of a quoted field only if the field is currently empty
                    if (currentField === '') {
                        inQuotedField = true;
                    } else {
                        currentField += char; // Treat as a normal character if field is not empty
                    }
                    break;
                default:
                    currentField += char;
            }
        }
    }

    // Add the last field and row if the file doesn't end with a newline
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        result.push(currentRow);
    }
    
    // Filter out any completely empty rows that might have been created by trailing newlines
    return result.filter(row => row.length > 1 || (row.length === 1 && row[0] !== ''));
}


/**
 * Creates a map of CSV headers to their column index.
 * @param {Array<string>} headerRow The header row of the CSV.
 * @returns {Map<string, number>}
 */
export function createHeaderMap(headerRow) {
  const map = new Map();
  if (!headerRow) return map;
  headerRow.forEach((header, index) => {
    map.set(header.toLowerCase().trim().replace(/"/g, ''), index);
  });
  return map;
}
