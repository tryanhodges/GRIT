/**
 * @file slotting.js
 * @description Contains the core business logic for the slotting algorithm and file parsing.
 */

import { appState } from './state.js';
import { robustCSVParse, createHeaderMap, toTitleCase, readFileAsText } from './utils.js';
import { showToast } from './ui.js';

/**
 * Parses an item string to extract its properties. Includes special logic for the BROOKS brand.
 * @param {string} itemString The raw item string from the file.
 * @param {string} [brand=''] The brand of the item, used for special parsing rules.
 * @returns {{Model: string, Color: string, Size: string, Sex: string}}
 */
export function parseItemString(itemString, brand = '') {
    let sex = 'M';
    let cleanItemString = itemString ? itemString.trim() : '';
    if (!cleanItemString) return { Model: 'N/A', Color: 'N/A', Size: 'N/A', Sex: sex };

    // BROOKS-specific logic
    if (brand.toUpperCase() === 'BROOKS') {
        const brooksRegex = /^(.*?)\s+(\d{3})\s+(.*)$/;
        const match = cleanItemString.match(brooksRegex);
        if (match) {
            cleanItemString = `${match[1]} ${match[3]}`;
        }
    }

    const firstChar = cleanItemString.charAt(0).toUpperCase();
    if (['M', 'W', 'Y', 'K'].includes(firstChar)) {
        sex = firstChar;
        cleanItemString = cleanItemString.substring(1).trim();
    }
    const words = cleanItemString.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return { Model: 'N/A', Color: 'N/A', Size: 'N/A', Sex: sex };
    let size = 'N/A';
    let wordsBeforeSize = [...words];
    const lastWord = words[words.length - 1];
    if (lastWord && !isNaN(parseFloat(lastWord)) && isFinite(lastWord)) {
        size = lastWord;
        wordsBeforeSize.pop();
    }
    if (wordsBeforeSize.length === 0) return { Model: 'N/A', Color: 'N/A', Size: size, Sex: sex };
    let modelEndIndex = -1;
    for (let i = wordsBeforeSize.length - 1; i >= 0; i--) {
        if (/\d/.test(wordsBeforeSize[i])) {
            modelEndIndex = i;
            break;
        }
    }
    let model = '';
    let color = '';
    if (modelEndIndex !== -1) {
        model = wordsBeforeSize.slice(0, modelEndIndex + 1).join(' ');
        color = wordsBeforeSize.slice(modelEndIndex + 1).join(' ');
    } else {
        if (wordsBeforeSize.length > 0) {
            color = wordsBeforeSize.pop();
            model = wordsBeforeSize.join(' ');
        }
    }
    return { Model: model.trim() || 'N/A', Color: color.trim() || 'N/A', Size: size, Sex: sex };
}

/**
 * Parses uploaded PO files to determine unreceived items.
 * @param {FileList|Array<File>} fileList The list of files to parse.
 */
export async function parsePOFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    const includeKids = document.getElementById('includeKids').checked;
    
    for (const file of fileList) {
        const brand = toTitleCase(file.name.replace(/\s*\d*\.csv$/i, '').trim());
        const csvText = await readFileAsText(file);
        const lines = robustCSVParse(csvText);
        if (lines.length < 2) continue;

        const headerMap = createHeaderMap(lines[0]);
        const itemIndex = headerMap.get('item');
        const qtyIndex = headerMap.get('quantity');
        const checkedInIndex = headerMap.get('checked in');

        if (itemIndex === undefined || qtyIndex === undefined || checkedInIndex === undefined) {
            showToast(`Skipping ${file.name}: Missing 'Item', 'Quantity', or 'Checked In' column.`, "error");
            continue;
        }

        const poItems = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i];
            const itemString = cols[itemIndex];
            if (!itemString || appState.exclusionKeywords.some(kw => itemString.toLowerCase().includes(kw.toLowerCase()))) {
                continue;
            }
            
            const quantity = parseInt(cols[qtyIndex], 10) || 0;
            const checkedIn = parseInt(cols[checkedInIndex], 10) || 0;
            const unreceivedQty = quantity - checkedIn;

            if (unreceivedQty > 0) {
                const { Model, Color, Size, Sex } = parseItemString(itemString, brand);
                 if (!includeKids && (Sex === 'Y' || Sex === 'K')) {
                    continue;
                }
                for (let j = 0; j < unreceivedQty; j++) {
                    poItems.push({ 
                        Brand: brand, Model, Color, Size, Sex, 
                        Sales: -1, Type: 'PO', 
                        UniqueID: `${file.name}-${brand}-${Model}-${Color}-${Size}-PO-${j + 1}`,
                        OriginalItemString: itemString
                    });
                }
            }
        }

        const poKey = file.name;
        if (poItems.length > 0) {
            appState.loadedPOs[poKey] = {
                brand,
                itemCount: poItems.length,
                loadedDate: new Date().toLocaleDateString(),
                status: 'unreceived',
                items: poItems
            };
        } else {
            // If a file is re-uploaded and now has 0 items, remove it
            delete appState.loadedPOs[poKey];
        }
    }
}

/**
 * The main slotting algorithm.
 * @param {object} data The data required for slotting.
 * @returns {{finalSlottedData: object, unslottedItems: Array, newlySlottedCount: number}}
 */
export function runLocalSlottingAlgorithm(data) {
    const {
        inventoryData = [],
        poData = [],
        previousSlottingData = null,
        settings = {},
        cushionData = { levels: [], assignments: {} },
        exclusionKeywords = []
    } = data;

    // 1. Process Previous Slotting Data
    let existingBackroom = {};
    if (previousSlottingData) {
        const lines = robustCSVParse(previousSlottingData);
        if (lines.length > 1) {
            const headerMap = createHeaderMap(lines[0]);
            const locIndex = headerMap.get('locationid');
            const itemStringIndex = headerMap.get('originalitemstring');
            const brandIndex = headerMap.get('brand');
            const typeIndex = headerMap.get('type');

            if (locIndex !== undefined && itemStringIndex !== undefined && brandIndex !== undefined && typeIndex !== undefined) {
                for (let i = 1; i < lines.length; i++) {
                    const cols = lines[i];
                    const locationId = cols[locIndex];
                    if (!locationId) continue;
                    const originalString = cols[itemStringIndex];
                    const { Model, Color, Size, Sex } = parseItemString(originalString, cols[brandIndex]);
                    existingBackroom[locationId] = {
                        UniqueID: `${cols[brandIndex]}-${Model}-${Color}-${Size}-${i}`,
                        Brand: cols[brandIndex], Model, Color, Size, Sex,
                        Type: cols[typeIndex], OriginalItemString: originalString
                    };
                }
            }
        }
    }

    // 2. Process Inventory Files
    let allInventoryItems = [];
    inventoryData.forEach(invFile => {
        const brand = invFile.brand;
        const lines = robustCSVParse(invFile.content);
        if (lines.length < 2) return;

        const headerMap = createHeaderMap(lines[0]);
        const itemIndex = headerMap.get('item');
        const remainingIndex = headerMap.get('remaining');
        if (itemIndex === undefined || remainingIndex === undefined) return;

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i];
            const itemString = cols[itemIndex];
            if (!itemString || exclusionKeywords.some(kw => itemString.toLowerCase().includes(kw.toLowerCase()))) continue;
            
            const remaining = parseInt(cols[remainingIndex], 10);
            if (!isNaN(remaining) && remaining > 0) {
                const { Model, Color, Size, Sex } = parseItemString(itemString, brand);
                if (!settings.includeKids && (Sex === 'Y' || Sex === 'K')) continue;
                for (let j = 0; j < remaining; j++) {
                    allInventoryItems.push({
                        Brand: brand, Model, Color, Size, Sex, Type: 'Inventory',
                        UniqueID: `${brand}-${Model}-${Color}-${Size}-${j + 1}`, OriginalItemString: itemString
                    });
                }
            }
        }
    });

    // 3. Process PO Files
    let allPoItems = [];
    poData.forEach(poFile => {
        const brand = poFile.brand;
        const lines = robustCSVParse(poFile.content);
        if (lines.length < 2) return;

        const headerMap = createHeaderMap(lines[0]);
        const itemIndex = headerMap.get('item');
        const qtyIndex = headerMap.get('quantity');
        const checkedInIndex = headerMap.get('checked in');

        if (itemIndex === undefined || qtyIndex === undefined || checkedInIndex === undefined) {
             console.warn(`Skipping PO file ${poFile.name}: Missing 'Item', 'Quantity', or 'Checked In' column.`);
             return;
        }

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i];
            const itemString = cols[itemIndex];
            if (!itemString || exclusionKeywords.some(kw => itemString.toLowerCase().includes(kw.toLowerCase()))) continue;
            
            const quantity = parseInt(cols[qtyIndex], 10) || 0;
            const checkedIn = parseInt(cols[checkedInIndex], 10) || 0;
            const unreceivedQty = quantity - checkedIn;

            if (unreceivedQty > 0) {
                const { Model, Color, Size, Sex } = parseItemString(itemString, brand);
                if (!settings.includeKids && (Sex === 'Y' || Sex === 'K')) continue;
                for (let j = 0; j < unreceivedQty; j++) {
                    allPoItems.push({
                        Brand: brand, Model, Color, Size, Sex, Type: 'PO',
                        UniqueID: `${poFile.name}-${brand}-${Model}-${Color}-${Size}-PO-${j + 1}`, OriginalItemString: itemString
                    });
                }
            }
        }
    });
    
    // 4. Reconcile and Sort
    const reconciledBackroom = {};
    const alreadyPlacedUniqueIDs = new Set();
    const currentInventoryMap = new Map(allInventoryItems.map(item => [item.UniqueID, item]));

    Object.entries(existingBackroom).forEach(([locationId, item]) => {
        if (currentInventoryMap.has(item.UniqueID)) {
            reconciledBackroom[locationId] = currentInventoryMap.get(item.UniqueID);
            alreadyPlacedUniqueIDs.add(item.UniqueID);
        }
    });

    const newInventoryItems = allInventoryItems.filter(item => !alreadyPlacedUniqueIDs.has(item.UniqueID));
    let itemsToSlot = [...newInventoryItems, ...allPoItems];
    
    const brandVolume = itemsToSlot.reduce((acc, item) => {
        acc[item.Brand] = (acc[item.Brand] || 0) + 1;
        return acc;
    }, {});

    const sexSortOrder = { 'W': 1, 'M': 2, 'Y': 3, 'K': 3 };
    itemsToSlot.sort((a, b) => {
        const sexA = sexSortOrder[a.Sex] || 4;
        const sexB = sexSortOrder[b.Sex] || 4;
        if (sexA !== sexB) return sexA - sexB;
        const volumeA = brandVolume[a.Brand] || 0;
        const volumeB = brandVolume[b.Brand] || 0;
        if (volumeA !== volumeB) return volumeB - volumeA;
        const cushionA = cushionData.assignments[a.Model];
        const cushionB = cushionData.assignments[b.Model];
        const priorityA = cushionA ? cushionData.levels.indexOf(cushionA) : 999;
        const priorityB = cushionB ? cushionData.levels.indexOf(cushionB) : 999;
        if (priorityA !== priorityB) return priorityA - priorityB;
        if (a.Model < b.Model) return -1; if (a.Model > b.Model) return 1;
        if (a.Color < b.Color) return -1; if (a.Color > b.Color) return 1;
        const sizeA = parseFloat(a.Size);
        const sizeB = parseFloat(b.Size);
        if (!isNaN(sizeA) && !isNaN(sizeB)) return sizeB - sizeA;
        return a.Size.localeCompare(b.Size);
    });

    // 5. Generate Slotting
    const { rackCount, sectionsPerRack, stacksPerSection, slotsPerStack, excludeRacks } = settings;
    const excludedRacksArr = excludeRacks.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    const backroom = { ...reconciledBackroom };
    const rackAssignments = {};
    Object.entries(reconciledBackroom).forEach(([locationId, item]) => {
        const [rackId] = locationId.split('-');
        if (!rackAssignments[rackId]) {
            rackAssignments[rackId] = { sex: item.Sex, brand: item.Brand };
        }
    });
    const itemGroups = new Map();
    for (const item of itemsToSlot) {
        const key = `${item.Sex}-${item.Brand}-${item.Model}-${item.Color}-${item.Size}-${item.Type}`;
        if (!itemGroups.has(key)) itemGroups.set(key, { item: item, originalItems: [] });
        itemGroups.get(key).originalItems.push(item);
    }
    let unslottedGroups = Array.from(itemGroups.values());
    const slottingPasses = [
        { mixColors: false, mixBrands: false }, { mixColors: true, mixBrands: false },
        { mixColors: false, mixBrands: true }, { mixColors: true, mixBrands: true }
    ];

    for (const passConfig of slottingPasses) {
        const remainingGroups = [];
        for (const group of unslottedGroups) {
            const { item, originalItems } = group;
            let slotted = false;
            groupSearch:
            for (let rackId = 1; rackId <= rackCount; rackId++) {
                if (excludedRacksArr.includes(rackId)) continue;
                const rackInfo = rackAssignments[rackId];
                if (rackInfo && rackInfo.sex !== item.Sex) continue;
                if (rackInfo && !passConfig.mixBrands && rackInfo.brand !== item.Brand) continue;

                for (let sectionId = 1; sectionId <= sectionsPerRack; sectionId++) {
                    let slotsInStack = {};
                    let emptySlotsInSection = 0;
                    for (let sId = 1; sId <= stacksPerSection; sId++) {
                        slotsInStack[sId] = { model: null, color: null, emptySlots: 0 };
                        for (let slId = 1; slId <= slotsPerStack; slId++) {
                            const loc = `${rackId}-${sectionId}-${sId}-${slId}`;
                            if (backroom[loc]) {
                                if (!slotsInStack[sId].model) {
                                    slotsInStack[sId].model = backroom[loc].Model;
                                    slotsInStack[sId].color = backroom[loc].Color;
                                }
                            } else {
                                slotsInStack[sId].emptySlots++;
                                emptySlotsInSection++;
                            }
                        }
                    }
                    if (emptySlotsInSection < originalItems.length) continue;
                    let availableStacks = [];
                    for (let sId = 1; sId <= stacksPerSection; sId++) {
                        const stack = slotsInStack[sId];
                        const canUseStack = stack.emptySlots > 0 && (!stack.model || (stack.model === item.Model && stack.color === item.Color) || (passConfig.mixColors && stack.model === item.Model));
                        if (canUseStack) availableStacks.push({ stackId: sId, emptySlots: stack.emptySlots });
                    }
                    if (availableStacks.reduce((sum, s) => sum + s.emptySlots, 0) >= originalItems.length) {
                        let placedCount = 0;
                        for (const stack of availableStacks.sort((a,b) => b.stackId - a.stackId)) {
                            for (let slotId = 1; slotId <= slotsPerStack; slotId++) {
                                if (placedCount >= originalItems.length) break;
                                const locId = `${rackId}-${sectionId}-${stack.stackId}-${slotId}`;
                                if (!backroom[locId]) {
                                    const currentItem = originalItems[placedCount];
                                    backroom[locId] = currentItem;
                                    currentItem.LocationID = locId;
                                    if (!rackAssignments[rackId]) rackAssignments[rackId] = { sex: item.Sex, brand: item.Brand };
                                    placedCount++;
                                }
                            }
                            if (placedCount >= originalItems.length) break;
                        }
                        slotted = true;
                        break groupSearch;
                    }
                }
            }
            if (!slotted) remainingGroups.push(group);
        }
        unslottedGroups = remainingGroups;
        if (unslottedGroups.length === 0) break;
    }

    const unslottedItems = unslottedGroups.flatMap(g => g.originalItems);
    
    return {
        finalSlottedData: backroom,
        unslottedItems: unslottedItems,
        newlySlottedCount: itemsToSlot.length - unslottedItems.length
    };
}
