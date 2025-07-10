// --- START: Firebase Configuration ---
// TODO: Add your Firebase project configuration here
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCb31JTu267sVk65VG--Grlp14w6cpkq2c",
  authDomain: "grit-7fb60.firebaseapp.com",
  projectId: "grit-7fb60",
  storageBucket: "grit-7fb60.firebasestorage.app",
  messagingSenderId: "278201731023",
  appId: "1:278201731023:web:b1f4c1662a427dcabcb4ba",
  measurementId: "G-LJ16FE68W4"
};


// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const functions = firebase.functions();
// --- END: Firebase Configuration ---


// --- START: Application State and Constants ---
const appState = {
    sites: [],
    selectedSiteId: null,
    finalSlottedData: {},
    unslottedItems: [],
    loadedPOs: {},
    exclusionKeywords: [],
    cushionLevels: [],
    modelCushionAssignments: {},
    currentView: 'grid',
    selectedRackId: 1,
    brandChart: null,
    userInitials: '',
    currentUser: {
        uid: null,
        email: null,
        role: null, // 'manager' or 'salesfloor'
        homeSiteId: null
    },
    colorMap: {
        'M': { name: 'Men', onHand: '#5468C1', po: '#a9b3e0' },
        'W': { name: 'Women', onHand: '#f846f0', po: '#fbc2f8' },
        'K': { name: 'Kids', onHand: '#64d669', po: '#b1ebc4' },
        'Y': { name: 'Kids', onHand: '#64d669', po: '#b1ebc4' }
    },
    cushionIndicatorColor: '#6b7280'
};
// --- END: Application State and Constants ---

const getEl = (id) => document.getElementById(id);

// --- START: All Function Declarations ---

// --- UI Feedback (Toast, Loader, Modal) ---
function showToast(message, type = 'info') {
    const toastContainer = getEl('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }, 3000);
}

function setLoading(isLoading, message = '') {
    getEl('loading-overlay').style.display = isLoading ? 'flex' : 'none';
    getEl('loading-message').textContent = message;
}

function showConfirmationModal(title, message, onConfirm) {
    const modal = getEl('confirmation-modal');
    getEl('confirmation-title').textContent = title;
    getEl('confirmation-message').textContent = message;
    modal.classList.add('visible');

    const confirmBtn = getEl('confirmation-confirm-btn');
    const cancelBtn = getEl('confirmation-cancel-btn');

    const confirmHandler = () => {
        onConfirm();
        closeModal();
    };

    const closeModal = () => {
        modal.classList.remove('visible');
        confirmBtn.removeEventListener('click', confirmHandler);
        cancelBtn.removeEventListener('click', closeModal);
    };

    confirmBtn.addEventListener('click', confirmHandler);
    cancelBtn.addEventListener('click', closeModal);
}


// --- Firestore Data Functions ---
async function saveDataToFirestore(collection, docId, data) {
    try {
        await db.collection(collection).doc(docId).set(data, { merge: true });
    } catch (e) {
        console.error("Error saving to Firestore", e);
        showToast("Error saving data to the cloud.", "error");
    }
}

async function loadDataFromFirestore(collection, docId) {
    try {
        const doc = await db.collection(collection).doc(docId).get();
        if (doc.exists) {
            return doc.data();
        }
        return null;
    } catch (e) {
        console.error("Error loading from Firestore", e);
        showToast("Error loading data from the cloud.", "error");
        return null;
    }
}

async function deleteDocument(collection, docId) {
    try {
        await db.collection(collection).doc(docId).delete();
    } catch (e) {
        console.error("Error deleting document:", e);
        showToast("Error deleting data from the cloud.", "error");
    }
}


// --- Event Handlers and Initialization ---
function handleFileChange(event, nameElementId) {
    const file = event.target.files[0];
    getEl(nameElementId).textContent = file?.name || 'No file chosen...';
    if (file) {
        getEl(nameElementId).innerHTML += `<span class="text-gray-400 ml-2">(${ (file.size / 1024).toFixed(2) } KB)</span>`;
    }
    checkFiles();
}

function handleMultiFileChange(event, nameContainerId, clearButtonId) {
    const files = event.target.files;
    const fileNamesContainer = getEl(nameContainerId);
    if (files.length > 0) {
        fileNamesContainer.innerHTML = Array.from(files).map(f => `<div class="truncate" title="${f.name}">${f.name}</div>`).join('');
        getEl(clearButtonId).classList.remove('hidden');
    } else {
        fileNamesContainer.textContent = 'No files chosen...';
        getEl(clearButtonId).classList.add('hidden');
    }
    checkFiles();
}

function clearLoadedInventory() {
    getEl('inventoryFile').value = '';
    getEl('inventoryFileNames').textContent = 'No files chosen...';
    getEl('clearInventoryBtn').classList.add('hidden');
    checkFiles();
    showToast("Loaded inventory files cleared.", "info");
}

function clearLoadedPOs() {
    getEl('poFile').value = '';
    getEl('poFileNames').textContent = 'No files chosen...';
    getEl('clearPOsBtn').classList.add('hidden');
    checkFiles();
    showToast("Loaded PO files cleared.", "info");
}

async function initializeAppForUser() {
    setLoading(true, "Loading sites...");
    await loadSites();
    const siteSelector = getEl('site-selector');
    if (appState.sites.length > 0) {
        const siteToSelect = appState.currentUser.homeSiteId || appState.sites[0].id;
        siteSelector.value = siteToSelect;
        appState.selectedSiteId = siteToSelect;
        await initializeFromStorage();
    } else {
        getEl('overviewSubtitle').textContent = 'No sites found. A manager must create a site to begin.';
        updateUiForSiteSelection();
    }
    setLoading(false);
}

async function initializeFromStorage() {
    if (!appState.selectedSiteId) {
        console.error("No site selected, cannot load data.");
        getEl('overviewSubtitle').textContent = 'Please select a site to begin.';
        updateUiForSiteSelection();
        return;
    }
    setLoading(true, `Loading data for ${appState.selectedSiteId}...`);
    
    // Reset local state before loading new site data
    appState.finalSlottedData = {};
    appState.unslottedItems = [];
    
    const settingsPath = `sites/${appState.selectedSiteId}/configs/mainSettings`;
    const storedSettings = await loadDataFromFirestore(settingsPath.split('/')[0], settingsPath.split('/')[1]);

    if (storedSettings) {
        getEl('rackCount').value = storedSettings.rackCount || 26;
        getEl('sectionsPerRack').value = storedSettings.sectionsPerRack || 8;
        getEl('stacksPerSection').value = storedSettings.stacksPerSection || 5;
        getEl('slotsPerStack').value = storedSettings.slotsPerStack || 5;
        getEl('excludeRacks').value = storedSettings.excludeRacks || '';
        getEl('includeKids').checked = storedSettings.includeKids || false;
        getEl('userInitials').value = storedSettings.userInitials || '';
        appState.userInitials = storedSettings.userInitials || '';
        getEl('colorMen').value = storedSettings.colorMap?.M.onHand || '#5468C1';
        getEl('colorMenPO').value = storedSettings.colorMap?.M.po || '#a9b3e0';
        getEl('colorWomen').value = storedSettings.colorMap?.W.onHand || '#f846f0';
        getEl('colorWomenPO').value = storedSettings.colorMap?.W.po || '#fbc2f8';
        getEl('colorKids').value = storedSettings.colorMap?.K.onHand || '#64d669';
        getEl('colorKidsPO').value = storedSettings.colorMap?.K.po || '#b1ebc4';
        getEl('colorCushion').value = storedSettings.cushionIndicatorColor || '#6b7280';
        updateColorState();
    }

    const slottingData = await loadDataFromFirestore(`sites/${appState.selectedSiteId}/slotting`, 'current');
    if (slottingData) {
        appState.finalSlottedData = slottingData.data || {};
        appState.unslottedItems = slottingData.unslotted || [];
    }

    const cushionData = await loadDataFromFirestore('configs', 'cushionData');
    if(cushionData) {
        appState.cushionLevels = cushionData.levels || [];
        appState.modelCushionAssignments = cushionData.assignments || {};
    }

    const poSnapshot = await db.collection(`sites/${appState.selectedSiteId}/purchaseOrders`).get();
    appState.loadedPOs = {};
    poSnapshot.forEach(doc => {
        appState.loadedPOs[doc.id] = doc.data();
    });
    renderPODetails();

    const exclusionData = await loadDataFromFirestore(`sites/${appState.selectedSiteId}/configs`, 'exclusionKeywords');
    if (exclusionData) {
        appState.exclusionKeywords = exclusionData.keywords || [];
    }
    
    renderExclusionList();
    renderCushionUI();
    renderUI();
    renderMetricsPanel();
    renderUnslottedReport();
    updateFilterDropdowns();
    updateUiForSiteSelection();
    setLoading(false);
}

function updateColorState() {
    appState.colorMap['M'].onHand = getEl('colorMen').value;
    appState.colorMap['M'].po = getEl('colorMenPO').value;
    appState.colorMap['W'].onHand = getEl('colorWomen').value;
    appState.colorMap['W'].po = getEl('colorWomenPO').value;
    const kidsOnHand = getEl('colorKids').value;
    const kidsPO = getEl('colorKidsPO').value;
    appState.colorMap['K'].onHand = kidsOnHand;
    appState.colorMap['K'].po = kidsPO;
    appState.colorMap['Y'].onHand = kidsOnHand; // Sync Y and K
    appState.colorMap['Y'].po = kidsPO;
    appState.cushionIndicatorColor = getEl('colorCushion').value;
}

async function saveSettings() {
    if (appState.currentUser.role !== 'manager') {
        showToast("You do not have permission to save settings.", "error");
        return;
    }
    if (!appState.selectedSiteId) {
        showToast("No site selected. Cannot save settings.", "error");
        return;
    }
    setLoading(true, "Saving settings...");
    updateColorState();
    appState.userInitials = getEl('userInitials').value.toUpperCase();
    const settings = {
        rackCount: getEl('rackCount').value,
        sectionsPerRack: getEl('sectionsPerRack').value,
        stacksPerSection: getEl('stacksPerSection').value,
        slotsPerStack: getEl('slotsPerStack').value,
        excludeRacks: getEl('excludeRacks').value,
        includeKids: getEl('includeKids').checked,
        userInitials: appState.userInitials,
        colorMap: appState.colorMap,
        cushionIndicatorColor: appState.cushionIndicatorColor
    };
    await saveDataToFirestore(`sites/${appState.selectedSiteId}/configs`, 'mainSettings', settings);
    showToast('Settings saved for this site!', 'success');
    renderUI();
    renderMetricsPanel();
    setLoading(false);
}

function searchAndRender() {
    const searchTerm = getEl('searchInput').value;
    renderUI();
}

function clearFilters() {
    getEl('brand-filter').value = '';
    getEl('model-filter').value = '';
    getEl('color-filter').value = '';
    getEl('size-filter').value = '';
    getEl('searchInput').value = '';

    updateFilterDropdowns();
    renderUI();
    showToast('Filters cleared.', 'info');
}

function checkFiles() {
    const invFiles = getEl('inventoryFile').files.length > 0;
    const sectionsInput = getEl('sectionsPerRack');
    const sectionsValue = parseInt(sectionsInput.value);
    const isSectionsEven = sectionsValue % 2 === 0;

    if (isSectionsEven) {
        sectionsInput.classList.remove('border-red-500');
        getEl('sections-error').classList.add('hidden');
    } else {
        sectionsInput.classList.add('border-red-500');
        getEl('sections-error').classList.remove('hidden');
    }

    getEl('slotBtn').disabled = !(invFiles && isSectionsEven);

    const dataLoaded = Object.keys(appState.finalSlottedData).length > 0;
    getEl('viewToggleBtn').disabled = !dataLoaded;
    getEl('downloadPdfBtn').disabled = !dataLoaded;
    getEl('downloadCsvBtn').disabled = !dataLoaded;
}

function toggleView() {
    appState.currentView = (appState.currentView === 'grid') ? 'detail' : 'grid';
    getEl('viewToggleBtn').textContent = `Switch to ${appState.currentView === 'grid' ? 'Detail' : 'Grid'} View`;
    renderUI();
}


// --- Search Filter Logic ---
function updateFilterDropdowns() {
    const items = Object.values(appState.finalSlottedData);
    if (items.length === 0) return;

    const brandFilter = getEl('brand-filter');
    const modelFilter = getEl('model-filter');
    const colorFilter = getEl('color-filter');
    const sizeFilter = getEl('size-filter');

    const selectedBrand = brandFilter.value;
    const selectedModel = modelFilter.value;
    const selectedColor = colorFilter.value;
    const selectedSize = sizeFilter.value;

    const getCounts = (itemList, prop) => {
        return itemList.reduce((acc, item) => {
            const key = item[prop];
            if (key) {
                acc.set(key, (acc.get(key) || 0) + 1);
            }
            return acc;
        }, new Map());
    };

    let filteredItems = items;

    const brandCounts = getCounts(items, 'Brand');
    populateSelect(brandFilter, brandCounts, 'All Brands');
    brandFilter.value = selectedBrand;

    if (selectedBrand) {
        filteredItems = filteredItems.filter(item => item.Brand === selectedBrand);
        modelFilter.disabled = false;
    } else {
        resetSelect(modelFilter, 'All Models');
        resetSelect(colorFilter, 'All Colors');
        resetSelect(sizeFilter, 'All Sizes');
        return;
    }

    const modelCounts = getCounts(filteredItems, 'Model');
    populateSelect(modelFilter, modelCounts, 'All Models');
    modelFilter.value = selectedModel;

    if (selectedModel) {
        filteredItems = filteredItems.filter(item => item.Model === selectedModel);
        colorFilter.disabled = false;
    } else {
        resetSelect(colorFilter, 'All Colors');
        resetSelect(sizeFilter, 'All Sizes');
        return;
    }

    const colorCounts = getCounts(filteredItems, 'Color');
    populateSelect(colorFilter, colorCounts, 'All Colors');
    colorFilter.value = selectedColor;

    if (selectedColor) {
        filteredItems = filteredItems.filter(item => item.Color === selectedColor);
        sizeFilter.disabled = false;
    } else {
        resetSelect(sizeFilter, 'All Sizes');
        return;
    }

    const sizeCounts = getCounts(filteredItems, 'Size');
    const sortedSizeMap = new Map([...sizeCounts.entries()].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])));
    populateSelect(sizeFilter, sortedSizeMap, 'All Sizes', false);
    sizeFilter.value = selectedSize;
}

function populateSelect(selectEl, optionsMap, defaultText, alphaSort = true) {
    const currentValue = selectEl.value;
    selectEl.innerHTML = `<option value="">${defaultText}</option>`;
    
    let sortedOptions;
    if (alphaSort) {
        sortedOptions = [...optionsMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    } else {
        sortedOptions = [...optionsMap.entries()]; // Use existing order
    }
    
    sortedOptions.forEach(([value, count]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = `${value} (${count})`;
        selectEl.appendChild(option);
    });
    selectEl.value = currentValue;
}

function resetSelect(selectEl, defaultText) {
    selectEl.innerHTML = `<option value="">${defaultText}</option>`;
    selectEl.disabled = true;
}


// --- Core Application Logic ---
async function runSlottingProcess() {
    if (appState.currentUser.role !== 'manager') {
        showToast("You do not have permission to run the slotting process.", "error");
        return;
    }
    if (!appState.selectedSiteId) {
        showToast("Please select a site before slotting.", "error");
        return;
    }
    
    setLoading(true, 'Preparing data for processing...');

    try {
        const inventoryFiles = getEl('inventoryFile').files;
        const poFiles = getEl('poFile').files;
        const prevSlottingFile = getEl('prevSlottingFile').files[0];

        const readFilePromises = [];
        const inventoryData = [];
        const poData = [];

        for (const file of inventoryFiles) {
            readFilePromises.push(readFileAsText(file).then(content => inventoryData.push({ name: file.name, brand: toTitleCase(file.name.replace(/\s*\d*\.csv$/i, '').trim()), content })));
        }
        for (const file of poFiles) {
            readFilePromises.push(readFileAsText(file).then(content => poData.push({ name: file.name, brand: toTitleCase(file.name.replace(/\s*\d*\.csv$/i, '').trim()), content })));
        }
        
        let previousSlottingData = null;
        if (prevSlottingFile) {
            readFilePromises.push(readFileAsText(prevSlottingFile).then(content => previousSlottingData = content));
        }

        await Promise.all(readFilePromises);

        setLoading(true, 'Processing in the cloud... This may take a moment.');

        const user = auth.currentUser;
        if (!user) {
            throw new Error("User not authenticated.");
        }
        const token = await user.getIdToken();

        const runSlotting = functions.httpsCallable('run-slotting');
        const result = await runSlotting({
            siteId: appState.selectedSiteId,
            inventoryData,
            poData,
            previousSlottingData,
            settings: {
                rackCount: getEl('rackCount').value,
                sectionsPerRack: getEl('sectionsPerRack').value,
                stacksPerSection: getEl('stacksPerSection').value,
                slotsPerStack: getEl('slotsPerStack').value,
                excludeRacks: getEl('excludeRacks').value,
                includeKids: getEl('includeKids').checked,
            },
            cushionData: {
                levels: appState.cushionLevels,
                assignments: appState.modelCushionAssignments,
            },
            exclusionKeywords: appState.exclusionKeywords,
        });

        setLoading(true, 'Rendering results...');
        
        appState.finalSlottedData = result.data.finalSlottedData;
        appState.unslottedItems = result.data.unslottedItems;

        // The function doesn't need to save POs, the client does after parsing
        await parsePOFiles(poFiles); 
        const batch = db.batch();
        Object.entries(appState.loadedPOs).forEach(([poKey, po]) => {
            const poRef = db.collection(`sites/${appState.selectedSiteId}/purchaseOrders`).doc(poKey);
            batch.set(poRef, po);
        });
        await batch.commit();

        renderMetricsPanel(result.data.newlySlottedCount);
        renderUnslottedReport();
        updateFilterDropdowns();
        renderUI();
        renderPODetails();
        checkFiles();
        showToast("Slotting process complete!", "success");

    } catch (error) {
        console.error("Error calling cloud function:", error);
        showToast(`An error occurred: ${error.message}`, "error");
    } finally {
        setLoading(false);
    }
}

// --- Parsing Functions ---
function toTitleCase(str) {
    return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

async function parsePOFiles(fileList) {
    const includeKids = getEl('includeKids').checked;
    let newPOsLoaded = false;
    for (const file of fileList) {
        // Always re-parse to apply current settings
        newPOsLoaded = true;
        const brand = toTitleCase(file.name.replace(/\s*\d*\.csv$/i, '').trim());
        const csvText = await readFileAsText(file);
        const lines = robustCSVParse(csvText);
        if (lines.length < 2) continue;

        const headerMap = createHeaderMap(lines[0]);
        const itemIndex = headerMap['item'];
        const qtyIndex = headerMap['order qty'];
        if (itemIndex === undefined || qtyIndex === undefined) {
            showToast(`Skipping ${file.name}: Missing 'Item' or 'Order Qty' column.`, 'error');
            continue;
        }

        const poItems = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i];
            const itemString = cols[itemIndex];
            if (appState.exclusionKeywords.some(kw => itemString.toLowerCase().includes(kw.toLowerCase()))) {
                continue;
            }
            const orderQty = parseInt(cols[qtyIndex], 10);

            if (itemString && !isNaN(orderQty) && orderQty > 0) {
                const { Model, Color, Size, Sex } = parseItemString(itemString);
                 if (!includeKids && (Sex === 'Y' || Sex === 'K')) {
                    continue;
                }
                for (let j = 0; j < orderQty; j++) {
                    poItems.push({ 
                        Brand: brand, Model, Color, Size, Sex, 
                        Sales: -1, Type: 'PO', 
                        UniqueID: `${file.name}-${brand}-${Model}-${Color}-${Size}-PO-${j + 1}`,
                        OriginalItemString: itemString // Save original string
                    });
                }
            }
        }

        if (poItems.length > 0) {
            const poKey = file.name;
            const currentPOState = appState.loadedPOs[poKey] || {};
            appState.loadedPOs[poKey] = {
                brand,
                itemCount: poItems.length,
                loadedDate: currentPOState.loadedDate || new Date().toLocaleDateString(),
                status: currentPOState.status || 'unreceived',
                items: poItems
            };
            const fileNamesContainer = getEl('poFileNames');
            const fileDiv = Array.from(fileNamesContainer.children).find(el => el.textContent.includes(file.name));
            if (fileDiv) {
                fileDiv.innerHTML = `${file.name} <span class="text-gray-400">- ${poItems.length} items</span>`;
            }
        }
    }
    if(newPOsLoaded) renderPODetails();
}

// --- Rendering Functions ---
async function renderPODetails() {
    const container = getEl('po-list-container');
    const summaryEl = getEl('po-summary');
    container.innerHTML = '';

    const poEntries = Object.entries(appState.loadedPOs);
    if (poEntries.length === 0) {
        container.innerHTML = `<p class="text-gray-500">No POs loaded for this site.</p>`;
        summaryEl.innerHTML = '';
        return;
    }

    let unreceivedCount = 0;
    for (const [poKey, poData] of poEntries) {
        const poEl = document.createElement('div');
        const isReceived = poData.status === 'received';
        if (!isReceived) {
            unreceivedCount += poData.itemCount;
        }

        poEl.className = `flex justify-between items-center p-3 rounded-lg border ${isReceived ? 'bg-green-50' : 'bg-gray-50'}`;

        poEl.innerHTML = `
            <div>
                <p class="font-semibold text-gray-800">${poKey}</p>
                <p class="text-sm text-gray-600">${poData.brand} - ${poData.itemCount} items - Loaded: ${poData.loadedDate}</p>
            </div>
            <button data-po-key="${poKey}" class="receive-po-btn action-btn text-sm py-1 px-3 w-auto ${isReceived ? 'bg-green-600' : 'bg-sky-600 hover:bg-sky-700'}" ${isReceived ? 'disabled' : ''}>
                ${isReceived ? 'Received' : 'Mark as Received'}
            </button>
        `;
        container.appendChild(poEl);
    }

    summaryEl.innerHTML = `Total Unreceived Items: <span class="text-sky-600">${unreceivedCount}</span>`;

    document.querySelectorAll('.receive-po-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (appState.currentUser.role === 'manager') {
                markPOAsReceived(e.currentTarget.dataset.poKey);
            } else {
                showToast("You do not have permission to receive POs.", "error");
            }
        });
    });
}

async function markPOAsReceived(poKey) {
    const poData = appState.loadedPOs[poKey];
    if (!poData || poData.status === 'received') return;

    poData.status = 'received';
    const poItemIds = new Set(poData.items.map(item => item.UniqueID));

    for (const loc in appState.finalSlottedData) {
        if (poItemIds.has(appState.finalSlottedData[loc].UniqueID)) {
            appState.finalSlottedData[loc].Type = 'Inventory';
        }
    }
    
    await saveDataToFirestore(`sites/${appState.selectedSiteId}/purchaseOrders`, poKey, poData);
    renderPODetails();
    renderUI();
    renderMetricsPanel();
    showToast(`PO "${poKey}" marked as received.`, "success");
}

function renderUI() {
    if (Object.keys(appState.finalSlottedData).length === 0) {
        getEl('visualization-container').innerHTML = '';
        getEl('overview-controls').classList.add('hidden');
        getEl('overviewSubtitle').classList.remove('hidden');
        return;
    }
    getEl('overview-controls').classList.remove('hidden');
    getEl('overviewSubtitle').classList.add('hidden');

    const container = getEl('visualization-container');
    container.innerHTML = '';
    const totalRacks = parseInt(getEl('rackCount')?.value) || 26;

    // --- Search & Filter Logic ---
    const searchTerm = getEl('searchInput')?.value.toLowerCase() || '';
    const brandFilter = getEl('brand-filter').value;
    const modelFilter = getEl('model-filter').value;
    const colorFilter = getEl('color-filter').value;
    const sizeFilter = getEl('size-filter').value;

    let matchingSlots = new Set();
    let matchingRacks = new Set();
    let isFiltering = searchTerm || brandFilter || modelFilter || colorFilter || sizeFilter;

    if (isFiltering) {
        for (const [loc, item] of Object.entries(appState.finalSlottedData)) {
            const textMatch = !searchTerm || (item.Brand?.toLowerCase().includes(searchTerm) ||
                             item.Model?.toLowerCase().includes(searchTerm) ||
                             item.Color?.toLowerCase().includes(searchTerm) ||
                             item.Size?.toString().toLowerCase().includes(searchTerm));

            const brandMatch = !brandFilter || item.Brand === brandFilter;
            const modelMatch = !modelFilter || item.Model === modelFilter;
            const colorMatch = !colorFilter || item.Color === colorFilter;
            const sizeMatch = !sizeFilter || item.Size === sizeFilter;

            if (textMatch && brandMatch && modelMatch && colorMatch && sizeMatch) {
                matchingSlots.add(loc);
                matchingRacks.add(loc.split('-')[0]);
            }
        }
    }

    if (appState.currentView === 'grid') {
        container.className = 'rack-grid';
        renderGridView(container, totalRacks, isFiltering, matchingSlots, matchingRacks);
    } else {
        container.className = 'detail-layout';
        renderDetailView(container, totalRacks, isFiltering, matchingSlots, matchingRacks);
    }
    renderLegend();
}

function renderGridView(container, totalRacks, isFiltering, matchingSlots, matchingRacks) {
    const sectionsPerRack = parseInt(getEl('sectionsPerRack').value) || 8;
    const stacksPerSection = parseInt(getEl('stacksPerSection').value) || 5;
    const slotsPerStack = parseInt(getEl('slotsPerStack').value) || 5;
    const sectionOrder = Array.from({ length: sectionsPerRack }, (_, i) => i + 1);
    const excludedRacks = getEl('excludeRacks').value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));

    let racksFound = 0;
    for (let rackId = 1; rackId <= totalRacks; rackId++) {
        if (excludedRacks.includes(rackId)) continue;
        if (isFiltering && !matchingRacks.has(rackId.toString())) continue;
        racksFound++;
        const rackEl = document.createElement('div');
        rackEl.className = 'rack-container';
        rackEl.style.gridTemplateRows = `repeat(${Math.ceil(sectionsPerRack / 2)}, auto)`;
        const brandsInRack = new Set(Object.values(appState.finalSlottedData).filter(item => item.LocationID?.startsWith(`${rackId}-`)).map(item => item.Brand));
        const brandLabel = Array.from(brandsInRack).join(', ') || 'Empty';
        rackEl.innerHTML = `<div class="rack-title" data-rack-id="${rackId}">Rack ${rackId}<span class="font-normal text-indigo-300 ml-2">- ${brandLabel}</span></div>`;
        rackEl.querySelector('.rack-title').addEventListener('click', (e) => { appState.selectedRackId = parseInt(e.currentTarget.dataset.rackId); toggleView(); });

        sectionOrder.forEach(sectionId => {
            const sectionEl = document.createElement('div');
            sectionEl.className = 'grid-section';
            sectionEl.dataset.sectionId = sectionId;
            for (let stackId = 1; stackId <= stacksPerSection; stackId++) {
                const stackEl = document.createElement('div');
                stackEl.className = 'grid-stack';
                for (let slotId = 1; slotId <= slotsPerStack; slotId++) {
                    const locationId = `${rackId}-${sectionId}-${stackId}-${slotId}`;
                    const slotEl = document.createElement('div');
                    slotEl.className = 'grid-slot';
                    const item = appState.finalSlottedData[locationId];
                    if (item) {
                        const colorInfo = appState.colorMap[item.Sex] || appState.colorMap['M'];
                        const color = item.Type === 'PO' ? colorInfo.po : colorInfo.onHand;
                        slotEl.style.backgroundColor = color;
                        slotEl.style.borderColor = colorInfo.onHand;
                    }
                    if (matchingSlots.has(locationId)) slotEl.classList.add('highlight-grid');
                    stackEl.appendChild(slotEl);
                }
                sectionEl.appendChild(stackEl);
            }
            rackEl.appendChild(sectionEl);
        });
        container.appendChild(rackEl);
    }
    if (isFiltering && racksFound === 0) container.innerHTML = `<p class="text-gray-500 text-center col-span-full">No items found matching the current filters.</p>`;
}

function renderDetailView(container, totalRacks, isFiltering, matchingSlots, matchingRacks) {
    const sectionsPerRack = parseInt(getEl('sectionsPerRack').value) || 8;
    const stacksPerSection = parseInt(getEl('stacksPerSection').value) || 5;
    const slotsPerStack = parseInt(getEl('slotsPerStack').value) || 5;
    const sectionOrder = Array.from({ length: sectionsPerRack }, (_, i) => i + 1);
    const excludedRacks = getEl('excludeRacks').value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));

    const sidebar = document.createElement('div');
    sidebar.className = 'detail-sidebar';
    const main = document.createElement('div');
    main.className = 'detail-main';

    if (isFiltering && !matchingRacks.has(appState.selectedRackId.toString())) {
        if (matchingRacks.size > 0) appState.selectedRackId = parseInt(Array.from(matchingRacks).sort((a,b) => parseInt(a) - parseInt(b))[0]);
    }

    for (let rackId = 1; rackId <= totalRacks; rackId++) {
        const isExcluded = excludedRacks.includes(rackId);
        if (isFiltering && !matchingRacks.has(rackId.toString()) && !isExcluded) continue;

        const rackButton = document.createElement('div');
        rackButton.className = 'sidebar-rack';
        if (rackId === appState.selectedRackId) rackButton.classList.add('active');
        if (isExcluded) rackButton.classList.add('excluded');

        const itemsInRack = Object.values(appState.finalSlottedData).filter(item => item.LocationID?.startsWith(`${rackId}-`));
        const brandsInRack = [...new Set(itemsInRack.map(item => item.Brand))];
        const firstItem = itemsInRack[0];

        let bgColor = '#f3f4f6';
        let textColor = '#1f2937';
        let brandColor = '#4b5563';

        if (firstItem && !isExcluded) {
            const colorInfo = appState.colorMap[firstItem.Sex] || appState.colorMap['M'];
            bgColor = firstItem.Type === 'Inventory' ? colorInfo.onHand : colorInfo.po;
            textColor = 'white';
            brandColor = '#e0e7ff';
        }

        rackButton.style.backgroundColor = bgColor;
        rackButton.dataset.rackId = rackId;
        const mainBrand = brandsInRack[0];
        rackButton.innerHTML = `<div class="rack-label" style="color: ${textColor}">${rackId}</div><div class="brand-label" style="color: ${brandColor}">${mainBrand || (isExcluded ? 'EXCLUDED' : 'Empty')}</div>`;
        
        if (!isExcluded) {
            rackButton.addEventListener('click', () => { appState.selectedRackId = rackId; renderUI(); });
        }
        sidebar.appendChild(rackButton);
    }

    const detailRack = document.createElement('div');
    detailRack.className = 'detail-rack-container';
    detailRack.style.gridTemplateRows = `repeat(${Math.ceil(sectionsPerRack / 2)}, auto)`;

    if (!isFiltering || matchingRacks.has(appState.selectedRackId.toString())) {
        sectionOrder.forEach(sectionId => {
            const sectionEl = document.createElement('div');
            sectionEl.className = 'detail-section';
            for (let stackId = 1; stackId <= stacksPerSection; stackId++) {
                const stackEl = document.createElement('div');
                stackEl.className = 'detail-stack';
                for (let slotId = 1; slotId <= slotsPerStack; slotId++) {
                    const locationId = `${appState.selectedRackId}-${sectionId}-${stackId}-${slotId}`;
                    const slotEl = document.createElement('div');
                    slotEl.className = 'detail-slot';
                    slotEl.dataset.locationId = locationId; // Add location ID for drag/drop
                    
                    const item = appState.finalSlottedData[locationId];
                    if (item) {
                        const colorInfo = appState.colorMap[item.Sex] || appState.colorMap['M'];
                        const color = item.Type === 'PO' ? colorInfo.po : colorInfo.onHand;
                        slotEl.style.backgroundColor = color;
                        slotEl.innerHTML = `<div class="font-semibold text-xs italic">${item.Model}</div><div class="text-xs">${item.Color}, Sz ${item.Size}</div>`;
                        slotEl.setAttribute('draggable', 'true');
                        slotEl.addEventListener('dragstart', handleDragStart);
                        slotEl.addEventListener('dragend', handleDragEnd);

                        // Add cushion indicator bar
                        const cushionLevel = appState.modelCushionAssignments[item.Model];
                        if (cushionLevel) {
                            const levelIndex = appState.cushionLevels.indexOf(cushionLevel);
                            if (levelIndex !== -1) {
                                slotEl.style.borderTopColor = getCushionIndicatorColor(levelIndex);
                            }
                        }

                    } else {
                        slotEl.classList.add('empty');
                        slotEl.innerHTML = `<span class="text-gray-400 text-xs">${locationId}</span>`;
                    }

                    // Add drop event listeners to ALL slots
                    slotEl.addEventListener('dragover', handleDragOver);
                    slotEl.addEventListener('dragleave', handleDragLeave);
                    slotEl.addEventListener('drop', handleDrop);

                    if (matchingSlots.has(locationId)) slotEl.classList.add('highlight-detail');
                    stackEl.appendChild(slotEl);
                }
                sectionEl.appendChild(stackEl);
            }
            detailRack.appendChild(sectionEl);
        });
    } else if (isFiltering) detailRack.innerHTML = `<p class="text-gray-500 text-center col-span-full py-16">No items found in this rack for the current filters.<br>Select a different rack from the sidebar.</p>`;
    main.appendChild(detailRack);
    if (sidebar.children.length === 0 && isFiltering) sidebar.innerHTML = `<p class="text-gray-500 text-center p-4 text-sm">No racks found.</p>`;
    container.appendChild(sidebar);
    container.appendChild(main);
}

function renderLegend() {
    const legendContainer = getEl('legend');
    legendContainer.innerHTML = '';
    const seenDepts = new Set(Object.values(appState.finalSlottedData).map(i => i.Sex));

    const departments = ['M', 'W', 'K'];
    departments.forEach(deptKey => {
        if (!seenDepts.has(deptKey) && !(deptKey === 'K' && seenDepts.has('Y'))) return;

        const colorInfo = appState.colorMap[deptKey];
        const legendItem = document.createElement('div');
        legendItem.className = 'flex items-center';
        legendItem.innerHTML = `
            <div class="w-4 h-4 mr-1 rounded-sm border" style="background-color: ${colorInfo.onHand};"></div>
            <div class="w-4 h-4 mr-2 rounded-sm border" style="background-color: ${colorInfo.po};"></div>
            <span>${colorInfo.name}</span>
        `;
        legendContainer.appendChild(legendItem);
    });
    const emptyLegend = document.createElement('div');
    emptyLegend.className = 'flex items-center';
    emptyLegend.innerHTML = `<div class="w-4 h-4 mr-2 rounded-sm border bg-gray-200"></div><span>Empty</span>`;
    legendContainer.appendChild(emptyLegend);
}

function renderMetricsPanel(newlySlottedCount) {
    const totalRacks = parseInt(getEl('rackCount')?.value) || 26;
    const excludedRacks = getEl('excludeRacks').value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    const activeRacks = totalRacks - excludedRacks.length;

    const sectionsPerRack = parseInt(getEl('sectionsPerRack').value) || 8;
    const stacksPerSection = parseInt(getEl('stacksPerSection').value) || 5;
    const slotsPerStack = parseInt(getEl('slotsPerStack').value) || 5;
    const totalSlots = activeRacks * sectionsPerRack * stacksPerSection * slotsPerStack;

    const slotsUsed = Object.keys(appState.finalSlottedData).length;
    const capacity = totalSlots > 0 ? (slotsUsed / totalSlots) * 100 : 0;
    getEl('slots-used').textContent = slotsUsed;
    getEl('slots-available').textContent = totalSlots - slotsUsed;
    getEl('slots-inbound').textContent = Object.values(appState.finalSlottedData).filter(item => item.Type === 'PO').length;
    if(newlySlottedCount > 0) getEl('items-newly-slotted').textContent = newlySlottedCount;
    const capacityBar = getEl('capacity-bar');
    capacityBar.style.width = `${capacity}%`;
    capacityBar.textContent = `${capacity.toFixed(1)}%`;
    renderBrandChart();
}

function renderBrandChart() {
    const ctx = getEl('brand-chart').getContext('2d');
    const brandData = {};

    Object.values(appState.finalSlottedData).forEach(item => {
        if (!brandData[item.Brand]) {
            brandData[item.Brand] = { onHand: 0, po: 0, sexCounts: { M: 0, W: 0, K: 0, Y: 0 } };
        }
        if (item.Type === 'Inventory') {
            brandData[item.Brand].onHand++;
        } else if (item.Type === 'PO') {
            brandData[item.Brand].po++;
        }
        brandData[item.Brand].sexCounts[item.Sex]++;
    });

    const labels = Object.keys(brandData).sort();
    const onHandData = [];
    const poData = [];
    const onHandColors = [];
    const poColors = [];

    labels.forEach(brand => {
        onHandData.push(brandData[brand].onHand);
        poData.push(brandData[brand].po);

        const counts = brandData[brand].sexCounts;
        let dominantSex = 'M';
        let maxCount = 0;
        for (const sex in counts) {
            if (counts[sex] > maxCount) {
                maxCount = counts[sex];
                dominantSex = sex;
            }
        }
        const colorInfo = appState.colorMap[dominantSex] || appState.colorMap['M'];
        onHandColors.push(colorInfo.onHand);
        poColors.push(colorInfo.po);
    });

    if (appState.brandChart) {
        appState.brandChart.destroy();
    }

    appState.brandChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Slotted',
                    data: onHandData,
                    backgroundColor: onHandColors,
                },
                {
                    label: 'Inbound',
                    data: poData,
                    backgroundColor: poColors,
                }
            ]
        },
        options: {
            scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                }
            }
        }
    });
}


// --- Exclusion List Functions ---
function renderExclusionList() {
    const container = getEl('exclusion-list');
    container.innerHTML = '';
    if (appState.exclusionKeywords.length === 0) {
        container.innerHTML = '<p class="text-gray-500">No exclusion keywords added.</p>';
        return;
    }
    appState.exclusionKeywords.forEach(keyword => {
        const el = document.createElement('div');
        el.className = 'flex justify-between items-center bg-gray-100 p-2 rounded';
        el.innerHTML = `
            <span>${keyword}</span>
            <button data-keyword="${keyword}" class="remove-exclusion-btn text-red-500 hover:text-red-700 font-bold">&times;</button>
        `;
        container.appendChild(el);
    });
    document.querySelectorAll('.remove-exclusion-btn').forEach(btn => {
        btn.addEventListener('click', () => removeExclusionKeyword(btn.dataset.keyword));
    });
}

async function addExclusionKeyword() {
    const input = getEl('exclusion-keyword-input');
    const keyword = input.value.trim();
    if (keyword && !appState.exclusionKeywords.includes(keyword)) {
        appState.exclusionKeywords.push(keyword);
        await saveDataToFirestore(`sites/${appState.selectedSiteId}/configs`, 'exclusionKeywords', { keywords: appState.exclusionKeywords });
        renderExclusionList();
        showToast(`'${keyword}' added to exclusions.`, 'success');
        input.value = '';
    } else if (!keyword) {
        showToast('Please enter a keyword.', 'error');
    } else {
        showToast(`'${keyword}' is already on the list.`, 'info');
    }
}

async function removeExclusionKeyword(keyword) {
    appState.exclusionKeywords = appState.exclusionKeywords.filter(kw => kw !== keyword);
    await saveDataToFirestore(`sites/${appState.selectedSiteId}/configs`, 'exclusionKeywords', { keywords: appState.exclusionKeywords });
    renderExclusionList();
    showToast(`'${keyword}' removed from exclusions.`, 'info');
}

// --- Cushion Sorting Functions ---
async function saveCushionData() {
    const dataToSave = {
        levels: appState.cushionLevels,
        assignments: appState.modelCushionAssignments
    };
    await saveDataToFirestore('configs', 'cushionData', dataToSave);
}

async function addCushionLevel() {
    const input = getEl('cushion-level-input');
    const level = input.value.trim();
    if (level && !appState.cushionLevels.includes(level)) {
        appState.cushionLevels.push(level);
        await saveCushionData();
        renderCushionUI();
        input.value = '';
        showToast(`Cushion level '${level}' added.`, 'success');
    } else if (!keyword) {
        showToast('Please enter a cushion level name.', 'error');
    } else {
        showToast(`'${level}' already exists.`, 'info');
    }
}

async function removeCushionLevel(levelToRemove) {
    appState.cushionLevels = appState.cushionLevels.filter(level => level !== levelToRemove);
    // Also remove any assignments that used this level
    for (const model in appState.modelCushionAssignments) {
        if (appState.modelCushionAssignments[model] === levelToRemove) {
            delete appState.modelCushionAssignments[model];
        }
    }
    await saveCushionData();
    renderCushionUI();
    showToast(`Cushion level '${levelToRemove}' removed.`, 'info');
}

function updateModelAssignmentList(allItems) {
    const container = getEl('model-assignment-list');
    container.innerHTML = '';
    
    const uniqueModels = [...new Set(allItems.map(item => item.Model))].sort();

    if (uniqueModels.length === 0) {
        container.innerHTML = '<p class="text-gray-500">Upload an inventory file to see models to assign.</p>';
        return;
    }

    uniqueModels.forEach(model => {
        const el = document.createElement('div');
        el.className = 'flex justify-between items-center';
        
        const label = document.createElement('label');
        label.className = 'font-medium text-gray-700';
        label.textContent = model;
        
        const select = document.createElement('select');
        select.className = 'border-gray-300 rounded-md shadow-sm w-48';
        select.innerHTML = '<option value="">Unassigned</option>';
        appState.cushionLevels.forEach(level => {
            const option = document.createElement('option');
            option.value = level;
            option.textContent = level;
            if (appState.modelCushionAssignments[model] === level) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        select.addEventListener('change', (e) => {
            const selectedLevel = e.target.value;
            if (selectedLevel) {
                appState.modelCushionAssignments[model] = selectedLevel;
            } else {
                delete appState.modelCushionAssignments[model];
            }
            saveCushionData();
        });

        el.appendChild(label);
        el.appendChild(select);
        container.appendChild(el);
    });
}

function getCushionIndicatorColor(levelIndex) {
    const baseColor = appState.cushionIndicatorColor;
    const totalLevels = appState.cushionLevels.length;
    
    // Return transparent if no levels or invalid index
    if (totalLevels === 0 || levelIndex === -1) {
        return 'transparent';
    }

    // Calculate opacity from 1.0 (for index 0) down to 0.1
    const opacity = 1.0 - (levelIndex / (totalLevels -1 || 1)) * 0.9;

    // Convert hex to RGB
    let r = 0, g = 0, b = 0;
    if (baseColor.length === 7) {
        r = parseInt(baseColor.substring(1, 3), 16);
        g = parseInt(baseColor.substring(3, 5), 16);
        b = parseInt(baseColor.substring(5, 7), 16);
    }
    
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function renderCushionUI() {
    const list = getEl('cushion-level-list');
    list.innerHTML = '';
    if (appState.cushionLevels.length === 0) {
        list.innerHTML = '<p class="text-gray-500 text-center py-4">No cushion levels defined.</p>';
    }

    appState.cushionLevels.forEach((level, index) => {
        const item = document.createElement('div');
        item.className = 'cushion-level-item bg-white p-2 rounded shadow-sm flex justify-between items-center';
        item.setAttribute('draggable', 'true');
        item.dataset.level = level;

        const colorSwatch = document.createElement('div');
        colorSwatch.className = 'w-4 h-4 rounded-full mr-2';
        colorSwatch.style.backgroundColor = getCushionIndicatorColor(index);
        
        const text = document.createElement('span');
        text.textContent = level;

        const leftSide = document.createElement('div');
        leftSide.className = 'flex items-center';
        leftSide.appendChild(colorSwatch);
        leftSide.appendChild(text);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-cushion-btn text-red-400 hover:text-red-600';
        removeBtn.innerHTML = '&times;';
        
        item.appendChild(leftSide);
        item.appendChild(removeBtn);
        list.appendChild(item);

        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeCushionLevel(level);
        });

        item.addEventListener('dragstart', e => {
            e.target.classList.add('dragging');
        });

        item.addEventListener('dragend', e => {
            e.target.classList.remove('dragging');
        });
    });

    list.addEventListener('dragover', e => {
        e.preventDefault();
        const afterElement = getDragAfterElement(list, e.clientY);
        const dragging = list.querySelector('.dragging');
        if (afterElement == null) {
            list.appendChild(dragging);
        } else {
            list.insertBefore(dragging, afterElement);
        }
    });

    list.addEventListener('drop', async () => {
        const newOrder = Array.from(list.querySelectorAll('.cushion-level-item')).map(item => item.dataset.level);
        appState.cushionLevels = newOrder;
        await saveCushionData();
        renderCushionUI(); // Re-render to update model assignment dropdowns and swatches
        showToast('Cushion priority updated.', 'success');
    });

    updateModelAssignmentList([]); // Initial render with empty list
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.cushion-level-item:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}


// --- Utility and Export Functions ---
function readFileAsText(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = e => resolve(e.target.result); reader.onerror = e => reject(e); reader.readAsText(file); }); }
function downloadFile(content, fileName) { const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = fileName; link.click(); }

function generateUniqueFilename(baseName) {
    const now = new Date();
    const date = `${(now.getMonth() + 1).toString().padStart(2, '0')}${(now.getDate()).toString().padStart(2, '0')}${now.getFullYear()}`;
    const time = `${(now.getHours()).toString().padStart(2, '0')}${(now.getMinutes()).toString().padStart(2, '0')}`;
    const initials = appState.userInitials ? ` ${appState.userInitials}` : '';
    return `${baseName} ${date} ${time}${initials}.csv`;
}

function generateCSV(slottedItems) {
    let csv = "UniqueID,Brand,Model,Size,Color,LocationID,Type,Sex,OriginalItemString\n";
    Object.entries(slottedItems)
        .sort(([locA], [locB]) => locA.localeCompare(locB, undefined, {numeric: true}))
        .forEach(([loc, item]) => {
            csv += `"${item.UniqueID||''}","${item.Brand||''}","${item.Model||''}","${item.Size||''}","${item.Color||''}","${loc}","${item.Type||''}","${item.Sex||''}","${item.OriginalItemString||''}"\n`;
        });
    return csv;
}

function downloadUnslottedCSV() {
    if (appState.unslottedItems.length === 0) {
        showToast("No unslotted items to download.", "info");
        return;
    }
    let csv = "Brand,Model,Size,Color,Type,Sex,OriginalItemString\n";
    appState.unslottedItems.forEach(item => {
        csv += `"${item.Brand||''}","${item.Model||''}","${item.Size||''}","${item.Color||''}","${item.Type||''}","${item.Sex||''}","${item.OriginalItemString||''}"\n`;
    });
    downloadFile(csv, 'unslotted_items.csv');
}

function renderUnslottedReport() {
    const container = getEl('unslotted-list-container');
    const badge = getEl('unslotted-badge');
    const downloadBtn = getEl('downloadUnslottedBtn');

    container.innerHTML = '';
    const items = appState.unslottedItems;

    if (items.length > 0) {
        badge.textContent = items.length;
        badge.classList.remove('hidden');
        downloadBtn.disabled = false;

        const table = document.createElement('table');
        table.className = 'w-full text-sm text-left text-gray-500';
        table.innerHTML = `
            <thead class="text-xs text-gray-700 uppercase bg-gray-50">
                <tr>
                    <th scope="col" class="px-4 py-3">Brand</th>
                    <th scope="col" class="px-4 py-3">Model</th>
                    <th scope="col" class="px-4 py-3">Color</th>
                    <th scope="col" class="px-4 py-3">Size</th>
                    <th scope="col" class="px-4 py-3">Type</th>
                </tr>
            </thead>
        `;
        const tbody = document.createElement('tbody');
        items.forEach(item => {
            const row = tbody.insertRow();
            row.className = 'bg-white border-b';
            row.innerHTML = `
                <td class="px-4 py-2 font-medium text-gray-900">${item.Brand}</td>
                <td class="px-4 py-2">${item.Model}</td>
                <td class="px-4 py-2">${item.Color}</td>
                <td class="px-4 py-2">${item.Size}</td>
                <td class="px-4 py-2">${item.Type}</td>
            `;
        });
        table.appendChild(tbody);
        container.appendChild(table);

    } else {
        badge.classList.add('hidden');
        downloadBtn.disabled = true;
        container.innerHTML = '<p class="text-gray-500">No unslotted items from the last run.</p>';
    }
}

function downloadInboundPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const inboundItems = Object.entries(appState.finalSlottedData).filter(([, item]) => item.Type === 'PO').map(([loc, item]) => ({...item, LocationID: loc})).sort((a,b) => a.LocationID.localeCompare(b.LocationID, undefined, {numeric: true}));
    if (inboundItems.length === 0) {
        showToast("No inbound PO items to generate a PDF for.", "info");
        return;
    }
    doc.setFontSize(18).text("Inbound PO Receiving Sheet", 14, 22);
    doc.setFontSize(11).setTextColor(100).text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
    doc.autoTable({
        head: [["Location ID", "Brand", "Model", "Size", "Color", "Sex"]],
        body: inboundItems.map(i => [i.LocationID, i.Brand, i.Model, i.Size, i.Color, i.Sex]),
        startY: 35,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] }
    });
    doc.save('inbound_po_slotting.pdf');
}

// --- START: Drag and Drop Handlers ---
function handleDragStart(e) {
    e.target.classList.add('dragging');
    e.dataTransfer.setData('text/plain', e.target.dataset.locationId);
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

function handleDragOver(e) {
    e.preventDefault(); // Necessary to allow dropping
    const targetSlot = e.target.closest('.detail-slot');
    if (targetSlot && !appState.finalSlottedData[targetSlot.dataset.locationId]) {
        targetSlot.classList.add('drag-over');
        e.dataTransfer.dropEffect = 'move';
    } else {
        e.dataTransfer.dropEffect = 'none';
    }
}

function handleDragLeave(e) {
    const targetSlot = e.target.closest('.detail-slot');
    if (targetSlot) {
        targetSlot.classList.remove('drag-over');
    }
}

function handleDrop(e) {
    e.preventDefault();
    const targetSlot = e.target.closest('.detail-slot');
    if (!targetSlot) return;

    targetSlot.classList.remove('drag-over');
    const sourceLocationId = e.dataTransfer.getData('text/plain');
    const targetLocationId = targetSlot.dataset.locationId;

    // Prevent dropping on itself or on an occupied slot
    if (sourceLocationId === targetLocationId || appState.finalSlottedData[targetLocationId]) {
        return;
    }

    // Perform the move in the data model
    const itemToMove = appState.finalSlottedData[sourceLocationId];
    itemToMove.LocationID = targetLocationId; // Update the item's internal location
    appState.finalSlottedData[targetLocationId] = itemToMove;
    delete appState.finalSlottedData[sourceLocationId];

    // Re-render the entire UI to reflect the change
    renderUI();
    showToast(`Moved item to ${targetLocationId}`, 'success');
}
// --- END: Drag and Drop Handlers ---

// --- START: Auth & User Management Functions ---
function showAuthError(message) {
    const errorDiv = getEl('auth-error');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

function clearAuthError() {
    getEl('auth-error').classList.add('hidden');
}

async function getOrCreateUserProfile(user) {
    const userRef = db.collection('users').doc(user.uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
        // This is a new user, create their profile
        const usersCollection = await db.collection('users').limit(1).get();
        const role = usersCollection.empty ? 'manager' : 'salesfloor';
        
        const newUserProfile = {
            email: user.email,
            role: role,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await userRef.set(newUserProfile);
        showToast(`Account created! You have been assigned the '${role}' role.`, 'success');
        return newUserProfile;
    } else {
        // Existing user
        return userDoc.data();
    }
}

async function handleGoogleSignIn() {
    clearAuthError();
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        await auth.signInWithPopup(provider);
        // onAuthStateChanged will handle the rest
    } catch (error) {
        showAuthError(error.message);
    }
}

async function handleSignUp() {
    clearAuthError();
    const email = getEl('email').value;
    const password = getEl('password').value;

    if (!email || !password) {
        showAuthError("Please enter both email and password.");
        return;
    }

    setLoading(true, "Creating account...");
    try {
        await auth.createUserWithEmailAndPassword(email, password);
        // onAuthStateChanged will handle creating the user profile
    } catch (error) {
        showAuthError(error.message);
    } finally {
        setLoading(false);
    }
}

async function handleSignIn() {
    clearAuthError();
    const email = getEl('email').value;
    const password = getEl('password').value;

    if (!email || !password) {
        showAuthError("Please enter both email and password.");
        return;
    }
    
    setLoading(true, "Logging in...");
    try {
        await auth.signInWithEmailAndPassword(email, password);
        // onAuthStateChanged will handle the rest
    } catch (error) {
        showAuthError(error.message);
    } finally {
        setLoading(false);
    }
}

function handleSignOut() {
    auth.signOut();
}

function adjustUiForRole(role) {
    const isManager = role === 'manager';
    
    // Toggle visibility of all manager-only elements
    document.querySelectorAll('.manager-only').forEach(el => {
        el.classList.toggle('hidden', !isManager);
    });

    // Explicitly enable/disable controls based on role
    getEl('add-cushion-level-btn').disabled = !isManager;
    getEl('add-exclusion-btn').disabled = !isManager;
    
    updateUiForSiteSelection();
}

async function renderUserManagementModal() {
    const container = getEl('user-list-container');
    container.innerHTML = '<div class="spinner"></div>'; // Show loader
    
    try {
        const usersSnapshot = await db.collection('users').get();
        container.innerHTML = '';
        if (usersSnapshot.empty) {
            container.innerHTML = '<p class="text-gray-500">No other users found.</p>';
            return;
        }

        usersSnapshot.docs.forEach(doc => {
            const user = doc.data();
            const userId = doc.id;
            
            const userEl = document.createElement('div');
            userEl.className = 'flex justify-between items-center p-3 rounded-lg bg-gray-50 border';
            
            const emailSpan = `<span class="font-semibold">${user.email}</span>`;
            const selfLabel = userId === appState.currentUser.uid ? '<span class="text-xs font-bold text-indigo-600 ml-2">(You)</span>' : '';
            
            const roleSelect = `
                <select data-uid="${userId}" class="role-select border-gray-300 rounded-md shadow-sm" ${userId === appState.currentUser.uid ? 'disabled' : ''}>
                    <option value="salesfloor" ${user.role === 'salesfloor' ? 'selected' : ''}>Salesfloor</option>
                    <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>Manager</option>
                </select>
            `;
            
            const deleteBtn = `<button data-uid="${userId}" data-email="${user.email}" class="delete-user-btn text-red-500 hover:text-red-700 disabled:opacity-50" ${userId === appState.currentUser.uid ? 'disabled' : ''}>&times;</button>`;
            
            userEl.innerHTML = `
                <div>${emailSpan} ${selfLabel}</div>
                <div class="flex items-center gap-4">${roleSelect} ${deleteBtn}</div>
            `;
            container.appendChild(userEl);
        });

        // Add event listeners after rendering
        document.querySelectorAll('.role-select').forEach(select => {
            select.addEventListener('change', (e) => updateUserRole(e.target.dataset.uid, e.target.value));
        });
        document.querySelectorAll('.delete-user-btn').forEach(btn => {
            btn.addEventListener('click', (e) => deleteUser(e.target.dataset.uid, e.target.dataset.email));
        });

    } catch (error) {
        console.error("Error fetching users:", error);
        container.innerHTML = '<p class="text-red-500">Could not load user list.</p>';
    }
}

async function updateUserRole(uid, newRole) {
    setLoading(true, `Updating role to ${newRole}...`);
    try {
        await db.collection('users').doc(uid).update({ role: newRole });
        showToast("User role updated successfully.", "success");
    } catch (error) {
        console.error("Error updating role:", error);
        showToast("Failed to update user role.", "error");
    } finally {
        setLoading(false);
    }
}

async function deleteUser(uid, email) {
    showConfirmationModal('Delete User?', `Are you sure you want to delete the user ${email}? This will remove their access permanently.`, async () => {
        setLoading(true, `Deleting user ${email}...`);
        try {
            // This only deletes the Firestore record, not the actual Firebase Auth user.
            // A Cloud Function is required to delete the auth user securely.
            await db.collection('users').doc(uid).delete();
            showToast("User record deleted. They can no longer log in with a role.", "success");
            renderUserManagementModal(); // Refresh the list
        } catch (error) {
            console.error("Error deleting user record:", error);
            showToast("Failed to delete user record.", "error");
        } finally {
            setLoading(false);
        }
    });
}

// --- Site Management ---
async function loadSites() {
    const sitesSnapshot = await db.collection('sites').get();
    appState.sites = sitesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const selector = getEl('site-selector');
    selector.innerHTML = '';
    if (appState.sites.length === 0) {
        selector.innerHTML = '<option value="">No sites available</option>';
    } else {
        appState.sites.forEach(site => {
            const option = document.createElement('option');
            option.value = site.id;
            option.textContent = site.name;
            selector.appendChild(option);
        });
    }
}

async function createNewSite() {
    const input = getEl('new-site-name');
    const siteName = input.value.trim();
    if (!siteName) {
        showToast("Please enter a site name.", "error");
        return;
    }
    const siteId = siteName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    
    setLoading(true, `Creating site: ${siteName}...`);
    try {
        await saveDataToFirestore('sites', siteId, { name: siteName });
        input.value = '';
        showToast("Site created successfully!", "success");
        await loadSites(); // Refresh site list
        renderSiteManagementModal();
    } catch (error) {
        showToast("Error creating site.", "error");
    } finally {
        setLoading(false);
    }
}

async function deleteSite(siteId, siteName) {
    showConfirmationModal('Delete Site?', `Are you sure you want to delete ${siteName}? All associated data will be permanently lost.`, async () => {
        setLoading(true, `Deleting site: ${siteName}...`);
        try {
            await deleteDocument('sites', siteId);
            // In a real-world app, a Cloud Function would be needed to delete all subcollections.
            showToast("Site deleted successfully.", "success");
            
            // If the deleted site was the selected one, reset the selection.
            if (appState.selectedSiteId === siteId) {
                appState.selectedSiteId = null;
            }
            
            await loadSites(); // Refresh site list in the dropdown
            renderSiteManagementModal(); // Re-render the modal list

            // If there are other sites, select the first one. Otherwise, clear the view.
            if (appState.sites.length > 0) {
                const siteSelector = getEl('site-selector');
                siteSelector.value = appState.sites[0].id;
                appState.selectedSiteId = appState.sites[0].id;
                await initializeFromStorage();
            } else {
                appState.selectedSiteId = null;
                // Clear the UI
                getEl('visualization-container').innerHTML = '';
                getEl('overview-controls').classList.add('hidden');
                getEl('overviewSubtitle').textContent = 'No sites found. A manager must create a site to begin.';
                getEl('overviewSubtitle').classList.remove('hidden');
                updateUiForSiteSelection();
            }
        } catch (error) {
            showToast("Error deleting site.", "error");
        } finally {
            setLoading(false);
        }
    });
}

async function setHomeSite() {
    const selectedSiteId = getEl('site-selector').value;
    if (!selectedSiteId || appState.sites.length === 0) {
        showToast("Please select a valid site first.", "error");
        return;
    }
    
    setLoading(true, "Setting home site...");
    try {
        await saveDataToFirestore('users', appState.currentUser.uid, { homeSiteId: selectedSiteId });
        appState.currentUser.homeSiteId = selectedSiteId;
        showToast("Home site saved!", "success");
    } catch (error) {
        showToast("Error setting home site.", "error");
    } finally {
        setLoading(false);
    }
}

function renderSiteManagementModal() {
    const container = getEl('site-list-container');
    container.innerHTML = '';
    if (appState.sites.length === 0) {
        container.innerHTML = '<p class="text-gray-500">No sites created yet.</p>';
        return;
    }
    appState.sites.forEach(site => {
        const el = document.createElement('div');
        el.className = 'flex justify-between items-center p-3 rounded-lg bg-gray-50 border';
        el.innerHTML = `
            <span class="font-semibold">${site.name}</span>
            <button data-site-id="${site.id}" data-site-name="${site.name}" class="delete-site-btn text-red-500 hover:text-red-700">&times;</button>
        `;
        container.appendChild(el);
    });

    document.querySelectorAll('.delete-site-btn').forEach(btn => {
        btn.addEventListener('click', (e) => deleteSite(e.target.dataset.siteId, e.target.dataset.siteName));
    });
}

function updateUiForSiteSelection() {
    const hasSite = !!appState.selectedSiteId;
    document.querySelectorAll('.file-input-btn, #slotBtn').forEach(el => {
        el.disabled = !hasSite;
    });
}


// --- START: Main Execution ---
document.addEventListener('DOMContentLoaded', function () {
    const authContainer = getEl('auth-container');
    const appContainer = getEl('app-container');
    const userInfoDiv = getEl('user-info');
    const userEmailSpan = getEl('user-email');

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            // User is signed in.
            setLoading(true, 'Verifying user...');
            const userProfile = await getOrCreateUserProfile(user);
            
            appState.currentUser.uid = user.uid;
            appState.currentUser.email = user.email;
            appState.currentUser.role = userProfile.role;
            appState.currentUser.homeSiteId = userProfile.homeSiteId || null;

            userEmailSpan.textContent = user.email;
            userInfoDiv.classList.remove('hidden');
            
            authContainer.classList.add('hidden');
            appContainer.classList.remove('hidden');
            
            adjustUiForRole(appState.currentUser.role);
            await initializeAppForUser();
            checkFiles();
            renderUnslottedReport();
            setLoading(false);

        } else {
            // User is signed out.
            appState.currentUser = { uid: null, email: null, role: null, homeSiteId: null };
            authContainer.classList.remove('hidden');
            appContainer.classList.add('hidden');
            userInfoDiv.classList.add('hidden');
        }
    });

    // Auth Event Listeners
    getEl('login-btn').addEventListener('click', handleSignIn);
    getEl('google-login-btn').addEventListener('click', handleGoogleSignIn);
    getEl('signup-btn').addEventListener('click', handleSignUp);
    getEl('logout-btn').addEventListener('click', handleSignOut);


    // Event Listeners
    getEl('prevSlottingFile').addEventListener('change', (e) => handleFileChange(e, 'prevSlottingFileName'));
    getEl('inventoryFile').addEventListener('change', (e) => handleMultiFileChange(e, 'inventoryFileNames', 'clearInventoryBtn'));
    getEl('poFile').addEventListener('change', (e) => handleMultiFileChange(e, 'poFileNames', 'clearPOsBtn'));

    getEl('slotBtn').addEventListener('click', runSlottingProcess);
    getEl('viewToggleBtn').addEventListener('click', toggleView);
    getEl('downloadPdfBtn').addEventListener('click', downloadInboundPDF);
    getEl('downloadCsvBtn').addEventListener('click', () => {
        const filename = generateUniqueFilename('Slotting Table');
        downloadFile(generateCSV(appState.finalSlottedData), filename);
    });
    getEl('downloadUnslottedBtn').addEventListener('click', downloadUnslottedCSV);


    getEl('search-btn').addEventListener('click', searchAndRender);
    getEl('clearInventoryBtn').addEventListener('click', clearLoadedInventory);
    getEl('clearPOsBtn').addEventListener('click', clearLoadedPOs);
    getEl('add-exclusion-btn').addEventListener('click', addExclusionKeyword);
    getEl('add-cushion-level-btn').addEventListener('click', addCushionLevel);
    getEl('clearFiltersBtn').addEventListener('click', clearFilters);

    // Filter dropdowns
    getEl('brand-filter').addEventListener('change', () => { updateFilterDropdowns(); renderUI(); });
    getEl('model-filter').addEventListener('change', () => { updateFilterDropdowns(); renderUI(); });
    getEl('color-filter').addEventListener('change', () => { updateFilterDropdowns(); renderUI(); });
    getEl('size-filter').addEventListener('change', () => { renderUI(); });


    // Template downloads
    getEl('invTemplateBtn').addEventListener('click', (e) => { e.preventDefault(); downloadFile(`"System ID","UPC","EAN","Custom SKU","Manufact. SKU","Item","Remaining","total cost","avg. cost","sale price","margin"\n"ignore","ignore","ignore","ignore","ignore","Cloudsurfer | Undyed/White 11.5","2","ignore","ignore","ignore","ignore"`, 'inventory_template.csv'); });
    getEl('poTemplateBtn').addEventListener('click', (e) => { e.preventDefault(); downloadFile(`"System ID","Item","UPC","EAN","Custom SKU","Manufact. SKU","#","Vendor ID","special order qty","Retail price","Qty. On Hand","Qty. On Order","Desired Inventory Level","Order Qty"\n"ignore","Cloud 5 | Black/White 10.5","ignore","ignore","ignore","ignore","ignore","ignore","ignore","ignore","ignore","ignore","ignore","5"`, 'po_template.csv'); });

    // Tab logic
    const tabs = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.getAttribute('data-tab');
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `tab-${target}`) {
                    content.classList.add('active');
                }
            });
        });
    });

    // Help dropdown logic
    const helpBtn = getEl('help-btn');
    const helpDropdown = getEl('help-dropdown');
    helpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        helpDropdown.classList.toggle('hidden');
    });

    // Settings Modal Logic
    const settingsModal = getEl('settings-modal');
    getEl('open-settings-btn').addEventListener('click', () => settingsModal.classList.add('visible'));
    getEl('close-settings-btn').addEventListener('click', () => settingsModal.classList.remove('visible'));
    getEl('save-settings-btn').addEventListener('click', () => {
        saveSettings();
        settingsModal.classList.remove('visible');
    });

    // User Management Modal Logic
    const userManagementModal = getEl('user-management-modal');
    getEl('open-user-management-btn').addEventListener('click', () => {
        renderUserManagementModal(); // Re-fetch users every time it's opened
        userManagementModal.classList.add('visible');
    });
    getEl('close-user-management-btn').addEventListener('click', () => userManagementModal.classList.remove('visible'));
    userManagementModal.addEventListener('click', (e) => {
        if (e.target === userManagementModal) {
            userManagementModal.classList.remove('visible');
        }
    });

    // Site Management Modal Logic
    const siteManagementModal = getEl('site-management-modal');
    getEl('open-site-management-btn').addEventListener('click', () => {
        renderSiteManagementModal();
        siteManagementModal.classList.add('visible');
    });
    getEl('close-site-management-btn').addEventListener('click', () => siteManagementModal.classList.remove('visible'));
    siteManagementModal.addEventListener('click', (e) => {
        if (e.target === siteManagementModal) {
            siteManagementModal.classList.remove('visible');
        }
    });
    getEl('create-site-btn').addEventListener('click', createNewSite);
    getEl('set-home-site-btn').addEventListener('click', setHomeSite);
    getEl('site-selector').addEventListener('change', (e) => {
        appState.selectedSiteId = e.target.value;
        initializeFromStorage();
    });


    // Global click listener to close dropdowns/modals
    document.addEventListener('click', (e) => {
        if (helpDropdown && !helpDropdown.contains(e.target) && !helpBtn.contains(e.target)) {
            helpDropdown.classList.add('hidden');
        }
    });
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.remove('visible');
        }
    });
});
// --- END: Main Execution ---

