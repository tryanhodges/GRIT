/**
 * @file main.js
 * @description The main entry point for the application.
 * This file orchestrates the application flow, initializes modules,
 * and sets up all major event listeners.
 */

// State and Firebase
import { appState } from './state.js';
import { db, auth } from './firebase.js';
import { serverTimestamp, collection, writeBatch } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// API and Logic
import { saveDataToFirestore, loadDataFromFirestore, deleteDocument, clearCollection } from './api.js';
import { runLocalSlottingAlgorithm, parsePOFiles, parseItemString } from './slotting.js';
import { initializeAuthListener, handleGoogleSignIn, handleSignUp, handleSignIn, handleSignOut } from './auth.js';
import { getEl, readFileAsText, downloadFile, generateUniqueFilename, generateCSV, toTitleCase, robustCSVParse, createHeaderMap } from './utils.js';

// UI
import {
    showToast, setLoading, showConfirmationModal,
    renderUI, renderPODetails, renderUnslottedReport, renderExclusionList, renderCushionUI,
    renderSiteManagementModal, renderUserManagementModal, renderMetricsPanel, updateModelAssignmentList,
    adjustUiForRole, updateUiForSiteSelection,
    checkFiles, toggleView, updateFilterDropdowns,
} from './ui.js';

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    initializeAuthListener();
    initializeEventListeners();
});

function initializeEventListeners() {
    // Auth
    getEl('login-btn').addEventListener('click', handleSignIn);
    getEl('google-login-btn').addEventListener('click', handleGoogleSignIn);
    getEl('signup-btn').addEventListener('click', handleSignUp);
    getEl('logout-btn').addEventListener('click', handleSignOut);

    // File Inputs
    getEl('prevSlottingFile').addEventListener('change', (e) => handleFileChange(e, 'prevSlottingFileName'));
    getEl('inventoryFile').addEventListener('change', (e) => handleMultiFileChange(e, 'inventoryFileNames', 'clearInventoryBtn'));
    getEl('poFile').addEventListener('change', (e) => {
        handleMultiFileChange(e, 'poFileNames', 'clearPOsBtn');
        parsePOFiles(e.target.files).then(() => renderPODetails());
    });
    getEl('cushionModelFile').addEventListener('change', handleCushionModelUpload);

    // Main Actions
    getEl('slotBtn').addEventListener('click', runSlottingProcess);
    getEl('viewToggleBtn').addEventListener('click', toggleView);
    getEl('downloadPdfBtn').addEventListener('click', downloadInboundPDF);
    getEl('downloadCsvBtn').addEventListener('click', () => {
        const filename = generateUniqueFilename('Slotting Table', appState.userInitials);
        downloadFile(generateCSV(appState.finalSlottedData), filename);
    });
    getEl('downloadUnslottedBtn').addEventListener('click', downloadUnslottedCSV);

    // Search and Filters
    getEl('search-btn').addEventListener('click', executeSearch);
    getEl('clearFiltersBtn').addEventListener('click', clearFilters);
    getEl('brand-filter').addEventListener('change', () => { updateFilterDropdowns(); renderUI(); });
    getEl('model-filter').addEventListener('change', () => { updateFilterDropdowns(); renderUI(); });
    getEl('color-filter').addEventListener('change', () => { updateFilterDropdowns(); renderUI(); });
    getEl('size-filter').addEventListener('change', () => { renderUI(); });

    // Clear Buttons
    getEl('clearInventoryBtn').addEventListener('click', clearLoadedInventory);
    getEl('clearPOsBtn').addEventListener('click', clearLoadedPOs);

    // Exclusions
    getEl('add-exclusion-btn').addEventListener('click', addExclusionKeyword);

    // Cushioning
    getEl('add-cushion-level-btn').addEventListener('click', addCushionLevel);

    // Templates
    getEl('invTemplateBtn').addEventListener('click', (e) => { e.preventDefault(); downloadFile(`"System ID","UPC","EAN","Custom SKU","Manufact. SKU","Item","Remaining","total cost","avg. cost","sale price","margin"\n"ignore","ignore","ignore","ignore","ignore","Cloudsurfer | Undyed/White 11.5","2","ignore","ignore","ignore","ignore"`, 'inventory_template.csv'); });
    getEl('poTemplateBtn').addEventListener('click', (e) => { e.preventDefault(); downloadFile(`"PO Number","Item","Quantity","Checked In"\n"12345","Cloud 5 | Black/White 10.5","5","0"`, 'po_template.csv'); });

    // Modals
    initializeModal('settings-modal', 'open-settings-btn', 'close-settings-btn');
    initializeModal('user-management-modal', 'open-user-management-btn', 'close-user-management-btn', renderUserManagementModal);
    initializeModal('site-management-modal', 'open-site-management-btn', 'close-site-management-btn', renderSiteManagementModal);
    
    // Settings Actions
    getEl('save-settings-btn').addEventListener('click', () => {
        saveSettings();
        getEl('settings-modal').classList.remove('visible');
    });
    getEl('clear-cushion-data-btn').addEventListener('click', clearCushionData);
    getEl('clear-site-slotting-data-btn').addEventListener('click', clearSiteSlottingData);

    // Site Management
    getEl('create-site-btn').addEventListener('click', createNewSite);
    getEl('set-home-site-btn').addEventListener('click', setHomeSite);
    getEl('site-selector').addEventListener('change', (e) => {
        appState.selectedSiteId = e.target.value;
        initializeFromStorage();
    });

    // Help Dropdown
    const helpBtn = getEl('help-btn');
    const helpDropdown = getEl('help-dropdown');
    helpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        helpDropdown.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
        if (helpDropdown && !helpDropdown.contains(e.target) && !helpBtn.contains(e.target)) {
            helpDropdown.classList.add('hidden');
        }
    });

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
}

function initializeModal(modalId, openBtnId, closeBtnId, onOpen) {
    const modal = getEl(modalId);
    getEl(openBtnId).addEventListener('click', () => {
        if (onOpen) onOpen();
        modal.classList.add('visible');
    });
    getEl(closeBtnId).addEventListener('click', () => modal.classList.remove('visible'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('visible');
        }
    });
}

// --- App Initialization ---

export async function initializeAppForUser() {
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

export async function initializeFromStorage() {
    if (!appState.selectedSiteId) {
        console.error("No site selected, cannot load data.");
        getEl('overviewSubtitle').textContent = 'Please select a site to begin.';
        updateUiForSiteSelection();
        return;
    }
    setLoading(true, `Loading data for ${appState.selectedSiteId}...`);
    
    appState.finalSlottedData = {};
    appState.unslottedItems = [];
    appState.exclusionKeywords = [];
    
    const defaultSettings = {
        rackCount: 26,
        sectionsPerRack: 8,
        stacksPerSection: 5,
        slotsPerStack: 5,
        excludeRacks: '',
        includeKids: false,
        userInitials: '',
        colorMap: {
            'M': { name: 'Men', onHand: '#5468C1', po: '#a9b3e0' },
            'W': { name: 'Women', onHand: '#f846f0', po: '#fbc2f8' },
            'K': { name: 'Kids', onHand: '#64d669', po: '#b1ebc4' },
            'Y': { name: 'Kids', onHand: '#64d669', po: '#b1ebc4' }
        },
        cushionIndicatorColor: '#6b7280'
    };

    const settingsPath = `sites/${appState.selectedSiteId}/configs/mainSettings`;
    const storedSettings = await loadDataFromFirestore(settingsPath);
    const finalSettings = { ...defaultSettings, ...storedSettings };

    getEl('rackCount').value = finalSettings.rackCount;
    getEl('sectionsPerRack').value = finalSettings.sectionsPerRack;
    getEl('stacksPerSection').value = finalSettings.stacksPerSection;
    getEl('slotsPerStack').value = finalSettings.slotsPerStack;
    getEl('excludeRacks').value = finalSettings.excludeRacks;
    getEl('includeKids').checked = finalSettings.includeKids;
    getEl('userInitials').value = finalSettings.userInitials;
    getEl('colorMen').value = finalSettings.colorMap.M.onHand;
    getEl('colorMenPO').value = finalSettings.colorMap.M.po;
    getEl('colorWomen').value = finalSettings.colorMap.W.onHand;
    getEl('colorWomenPO').value = finalSettings.colorMap.W.po;
    getEl('colorKids').value = finalSettings.colorMap.K.onHand;
    getEl('colorKidsPO').value = finalSettings.colorMap.K.po;
    getEl('colorCushion').value = finalSettings.cushionIndicatorColor;

    appState.userInitials = finalSettings.userInitials;
    appState.colorMap = finalSettings.colorMap;
    appState.cushionIndicatorColor = finalSettings.cushionIndicatorColor;

    const slottingData = await loadDataFromFirestore(`sites/${appState.selectedSiteId}/slotting/current`);
    if (slottingData) {
        appState.finalSlottedData = slottingData.data || {};
        appState.unslottedItems = slottingData.unslotted || [];
    }

    const cushionData = await loadDataFromFirestore('configs/cushionData');
    if(cushionData) {
        appState.cushionLevels = cushionData.levels || [];
        appState.modelCushionAssignments = cushionData.assignments || {};
        appState.allKnownModels = cushionData.models || [];
    }

    const poCollectionRef = collection(db, `sites/${appState.selectedSiteId}/purchaseOrders`);
    const poSnapshot = await getDocs(poCollectionRef);
    appState.loadedPOs = {};
    poSnapshot.forEach(doc => {
        appState.loadedPOs[doc.id] = doc.data();
    });
    renderPODetails();

    const exclusionData = await loadDataFromFirestore(`sites/${appState.selectedSiteId}/configs/exclusionKeywords`);
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

// --- Handler Functions ---

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
        
        await parsePOFiles(poFiles);

        setLoading(true, 'Processing... This may take a moment.');

        const result = runLocalSlottingAlgorithm({
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

        setLoading(true, 'Saving and rendering results...');
        
        appState.finalSlottedData = result.finalSlottedData;
        appState.unslottedItems = result.unslottedItems;

        const slottingResults = {
            data: appState.finalSlottedData,
            unslotted: appState.unslottedItems,
            lastUpdated: serverTimestamp(),
            updatedBy: appState.currentUser.email
        };
        await saveDataToFirestore(`sites/${appState.selectedSiteId}/slotting/current`, slottingResults);

        const batch = writeBatch(db);
        Object.entries(appState.loadedPOs).forEach(([poKey, po]) => {
            const poRef = doc(db, `sites/${appState.selectedSiteId}/purchaseOrders`, poKey);
            batch.set(poRef, po);
        });
        await batch.commit();

        renderMetricsPanel(result.newlySlottedCount);
        getEl('metrics-container').open = false;
        renderUnslottedReport();
        updateFilterDropdowns();
        renderUI();
        renderPODetails();
        checkFiles();
        showToast("Slotting process complete!", "success");

    } catch (error) {
        console.error("Error during local slotting process:", error);
        showToast(`An error occurred: ${error.message}`, "error");
    } finally {
        setLoading(false);
    }
}

async function downloadInboundPDF() {
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

async function executeSearch() {
    const searchTerm = getEl('searchInput').value.toLowerCase().trim();
    if (!appState.selectedSiteId) {
        showToast("Please select a site to search.", "error");
        return;
    }

    if (!searchTerm) {
        await initializeFromStorage();
        return;
    }

    setLoading(true, `Searching site ${appState.selectedSiteId} for "${searchTerm}"...`);
    try {
        const slottingData = await loadDataFromFirestore(`sites/${appState.selectedSiteId}/slotting/current`);
        let searchResults = {};

        if (slottingData && slottingData.data) {
            for (const loc in slottingData.data) {
                const item = slottingData.data[loc];
                const itemText = `${item.Brand} ${item.Model} ${item.Color} ${item.Size}`.toLowerCase();
                if (itemText.includes(searchTerm)) {
                    searchResults[loc] = item;
                }
            }
        }
        
        appState.finalSlottedData = searchResults;
        renderUI();
        showToast(`${Object.keys(searchResults).length} items found in this site.`);
    } catch (error) {
        console.error("Error during site search:", error);
        showToast("An error occurred during search.", "error");
    } finally {
        setLoading(false);
    }
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
    await saveDataToFirestore(`sites/${appState.selectedSiteId}/configs/mainSettings`, settings);
    showToast('Settings saved for this site!', 'success');
    renderUI();
    renderMetricsPanel();
    setLoading(false);
}

async function addExclusionKeyword() {
    const input = getEl('exclusion-keyword-input');
    const keyword = input.value.trim();
    if (keyword && !appState.exclusionKeywords.includes(keyword)) {
        appState.exclusionKeywords.push(keyword);
        await saveDataToFirestore(`sites/${appState.selectedSiteId}/configs/exclusionKeywords`, { keywords: appState.exclusionKeywords });
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
    await saveDataToFirestore(`sites/${appState.selectedSiteId}/configs/exclusionKeywords`, { keywords: appState.exclusionKeywords });
    renderExclusionList();
    showToast(`'${keyword}' removed from exclusions.`, 'info');
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
    } else if (!level) {
        showToast('Please enter a cushion level name.', 'error');
    } else {
        showToast(`'${level}' already exists.`, 'info');
    }
}

async function removeCushionLevel(levelToRemove) {
    appState.cushionLevels = appState.cushionLevels.filter(level => level !== levelToRemove);
    for (const model in appState.modelCushionAssignments) {
        if (appState.modelCushionAssignments[model] === levelToRemove) {
            delete appState.modelCushionAssignments[model];
        }
    }
    await saveCushionData();
    renderCushionUI();
    showToast(`Cushion level '${levelToRemove}' removed.`, 'info');
}

async function handleCushionModelUpload(event) {
    const files = event.target.files;
    if (files.length === 0) return;

    setLoading(true, "Parsing models from files...");
    let newModelsFound = 0;
    const newModelSet = new Set(appState.allKnownModels);

    for (const file of files) {
        const brand = toTitleCase(file.name.replace(/\s*\d*\.csv$/i, '').trim());
        const csvText = await readFileAsText(file);
        const lines = robustCSVParse(csvText);
        if (lines.length < 2) continue;

        const headerMap = createHeaderMap(lines[0]);
        const itemIndex = headerMap.get('item');
        if (itemIndex === undefined) continue;

        for (let i = 1; i < lines.length; i++) {
            const itemString = lines[i][itemIndex];
            if (itemString) {
                const { Model } = parseItemString(itemString, brand);
                if (Model !== 'N/A' && !newModelSet.has(Model)) {
                    newModelSet.add(Model);
                    newModelsFound++;
                }
            }
        }
    }

    appState.allKnownModels = Array.from(newModelSet);
    await saveCushionData();
    updateModelAssignmentList();
    setLoading(false);
    showToast(`${newModelsFound} new models added to the assignment list.`, 'success');
    getEl('cushionModelFile').value = ''; // Clear file input
}

async function clearCushionData() {
    showConfirmationModal('Clear All Cushion Data?', 'This will remove all cushion levels and model assignments for all sites. This action cannot be undone.', async () => {
        setLoading(true, 'Clearing cushion data...');
        appState.cushionLevels = [];
        appState.modelCushionAssignments = {};
        appState.allKnownModels = [];
        await saveDataToFirestore('configs/cushionData', { levels: [], assignments: {}, models: [] });
        renderCushionUI();
        setLoading(false);
        showToast('All cushion data has been cleared.', 'success');
    });
}

async function clearSiteSlottingData() {
    if (!appState.selectedSiteId) {
        showToast("Please select a site first.", "error");
        return;
    }
    showConfirmationModal('Clear Site Data?', `This will clear all PO and Inventory data for ${appState.selectedSiteId}. This action cannot be undone.`, async () => {
        setLoading(true, `Clearing data for ${appState.selectedSiteId}...`);
        appState.finalSlottedData = {};
        appState.unslottedItems = [];
        appState.loadedPOs = {};
        
        await clearCollection(`sites/${appState.selectedSiteId}/purchaseOrders`);
        await deleteDocument(`sites/${appState.selectedSiteId}/slotting/current`);
        
        await initializeFromStorage(); // Reload to reflect cleared state
        setLoading(false);
        showToast(`PO and Inventory data for ${appState.selectedSiteId} has been cleared.`, 'success');
    });
}
