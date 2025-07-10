const admin = require("firebase-admin");

// This helper function will initialize the Firebase Admin SDK.
// It ensures that we only initialize it once per function invocation.
const initializeFirebaseAdmin = () => {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }
  return admin;
};

// Helper function to parse the item string (same as the one from the frontend)
function parseItemString(itemString) {
    let sex = 'M';
    let cleanItemString = itemString.trim();
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

// This is the main handler for our Netlify Function.
exports.handler = async (event, context) => {
  // Set CORS headers to allow requests from any origin.
  // For production, you might want to restrict this to your Netlify domain.
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle preflight OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
        statusCode: 204,
        headers,
        body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed', headers };
  }

  const admin = initializeFirebaseAdmin();
  const db = admin.firestore();

  // Verify the user's token to ensure they are authenticated.
  const token = event.headers.authorization?.split('Bearer ')[1];
  if (!token) {
    return { statusCode: 401, body: 'Unauthorized: No token provided.', headers };
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(token);
  } catch (error) {
    console.error("Error verifying token:", error);
    return { statusCode: 401, body: 'Unauthorized: Invalid token.', headers };
  }
  
  const uid = decodedToken.uid;
  const userDoc = await db.collection('users').doc(uid).get();

  // Check if the user has the 'manager' role.
  if (!userDoc.exists || userDoc.data().role !== 'manager') {
    return { statusCode: 403, body: 'Permission Denied: Only managers can run this process.', headers };
  }

  const { inventoryData, poData, previousSlottingData, settings, cushionData, exclusionKeywords } = JSON.parse(event.body);

  // The entire slotting logic from the previous Firebase Function goes here.
  // It's exactly the same algorithm, just wrapped in a Netlify Function handler.
  
  // 1. Process Previous Slotting Data
    let existingBackroom = {};
    if (previousSlottingData) {
        const lines = previousSlottingData.split('\n').map(l => l.split(','));
        const header = lines[0].map(h => h.replace(/"/g, '').toLowerCase());
        const locIndex = header.indexOf('locationid');
        const itemStringIndex = header.indexOf('originalitemstring');
        const brandIndex = header.indexOf('brand');
        const typeIndex = header.indexOf('type');

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].map(c => c.replace(/"/g, ''));
            if (cols.length < locIndex + 1) continue;
            const locationId = cols[locIndex];
            if (!locationId) continue;
            const originalString = cols[itemStringIndex];
            const { Model, Color, Size, Sex } = parseItemString(originalString);
            existingBackroom[locationId] = {
                UniqueID: `${cols[brandIndex]}-${Model}-${Color}-${Size}-${i}`,
                Brand: cols[brandIndex], Model, Color, Size, Sex,
                Type: cols[typeIndex], OriginalItemString: originalString
            };
        }
    }

    // 2. Process Inventory Files
    let allInventoryItems = [];
    inventoryData.forEach(invFile => {
        const brand = invFile.brand;
        const lines = invFile.content.split('\n').map(l => l.split(','));
        const header = lines[0].map(h => h.replace(/"/g, '').toLowerCase());
        const itemIndex = header.indexOf('item');
        const remainingIndex = header.indexOf('remaining');

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].map(c => c.replace(/"/g, ''));
            if (cols.length < Math.max(itemIndex, remainingIndex) + 1) continue;
            const itemString = cols[itemIndex];
            if (exclusionKeywords.some(kw => itemString.toLowerCase().includes(kw.toLowerCase()))) continue;
            const remaining = parseInt(cols[remainingIndex], 10);
            if (itemString && !isNaN(remaining) && remaining > 0) {
                const { Model, Color, Size, Sex } = parseItemString(itemString);
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
        const lines = poFile.content.split('\n').map(l => l.split(','));
        const header = lines[0].map(h => h.replace(/"/g, '').toLowerCase());
        const itemIndex = header.indexOf('item');
        const qtyIndex = header.indexOf('order qty');

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].map(c => c.replace(/"/g, ''));
            if (cols.length < Math.max(itemIndex, qtyIndex) + 1) continue;
            const itemString = cols[itemIndex];
            if (exclusionKeywords.some(kw => itemString.toLowerCase().includes(kw.toLowerCase()))) continue;
            const orderQty = parseInt(cols[qtyIndex], 10);
            if (itemString && !isNaN(orderQty) && orderQty > 0) {
                const { Model, Color, Size, Sex } = parseItemString(itemString);
                if (!settings.includeKids && (Sex === 'Y' || Sex === 'K')) continue;
                for (let j = 0; j < orderQty; j++) {
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
    
  // Return the results to the frontend.
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      finalSlottedData: backroom,
      unslottedItems: unslottedItems,
      newlySlottedCount: itemsToSlot.length
    }),
  };
};
