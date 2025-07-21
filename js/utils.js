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
    // MODIFICATION: Use \r\n for better compatibility with Excel
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
    if (csvText.charCodeAt(0) === 0xFEFF) {
        csvText = csvText.slice(1);
    }
    
    csvText = csvText.replace(/[\u201C\u201D\u201E]/g, '"');

    // MODIFICATION: Normalize all line endings to \n before splitting
    const lines = csvText.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    
    const result = [];
    const regex = /(?:^|,)(\"(?:[^\"]+|\"\")*\"|[^,]*)/g;

    for (const line of lines) {
        if (!line.trim()) continue;
        const columns = [];
        let match;
        while (match = regex.exec(line)) {
            let column = match[1];
            if (column.startsWith('"') && column.endsWith('"')) {
                column = column.substring(1, column.length - 1).replace(/""/g, '"');
            }
            columns.push(column.trim());
        }
        result.push(columns);
    }
    return result;
}

/**
 * Creates a map of CSV headers to their column index.
 * @param {Array<string>} headerRow The header row of the CSV.
 * @returns {Map<string, number>}
 */
export function createHeaderMap(headerRow) {
  const map = new Map();
  headerRow.forEach((header, index) => {
    map.set(header.toLowerCase().trim().replace(/"/g, ''), index);
  });
  return map;
}
