/**
 * @file main.js
 * @description The main entry point for the application.
 * This file orchestrates the application flow, initializes modules,
 * and sets up all major event listeners.
 */

// State and Firebase
import { appState } from './state.js';
import { db } from './firebase.js';
import { serverTimestamp, collection, writeBatch, doc, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

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
    adjustUiForRole, updateUiForSiteSelection, renderSiteSelector, updateFilterDropdowns, checkFiles,
    toggleView
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

    // MODIFIED: Listen for custom event to initialize the app
    document.addEventListener('user-authenticated', initializeAppForUser);

    // File Inputs
    getEl('prevSlottingFile').addEventListener('change', (e) => handleFileChange(e, 'prevSlottingFileName'));
    getEl('inventoryFile').addEventListener('change', (e) => handleMultiFileChange(e, 'inventoryFileNames', 'clearInventoryBtn', 'inventory'));
    getEl('poFile').addEventListener('change', (e) => {
        handleMultiFileChange(e, 'poFileNames', 'clearPOsBtn', 'po');
        // We still parse here to give the user immediate feedback in the UI
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

    // MODIFIED: Search and Filters now just trigger a re-render
    getEl('search-btn').addEventListener('click', renderUI);
    getEl('clearFiltersBtn').addEventListener('click', clearFilters);
    getEl('brand-filter').addEventListener('change', () => { updateFilterDropdowns(); renderUI(); });
    getEl('model-filter').addEventListener('change', () => { updateFilterDropdowns(); renderUI(); });
    getEl('color-filter').addEventListener('change', () => { updateFilterDropdowns(); renderUI(); });
    getEl('size-filter').addEventListener('change', () => { renderUI(); });
    getEl('searchInput').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') renderUI();
    });


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

    // Event Delegation for dynamic elements
    document.body.addEventListener('click', (e) => {
        const target = e.target;
        const action = target.dataset.action || target.closest('[data-action]')?.dataset.action;

        switch(action) {
            case 'delete-site':
                deleteSite(target.dataset.siteId, target.dataset.siteName);
                break;
            case 'receive-po':
                if (appState.currentUser.role === 'manager') {
                    markPOAsReceived(target.dataset.poKey);
                } else {
                    showToast("You do not have permission to receive POs.", "error");
                }
                break;
            case 'remove-exclusion':
                removeExclusionKeyword(target.dataset.keyword);
                break;
            case 'select-rack-title':
                appState.selectedRackId = parseInt(target.dataset.rackId);
                toggleView();
                break;
            case 'select-rack':
                appState.selectedRackId = parseInt(target.closest('[data-action="select-rack"]').dataset.rackId);
                renderUI();
                break;
            case 'approve-user':
                handleApprovalAction(target.dataset.uid, 'approved');
                break;
            case 'deny-user':
                handleApprovalAction(target.dataset.uid, 'denied');
                break;
            case 'delete-user':
                deleteUser(target.dataset.uid, target.dataset.email);
                break;
            case 'remove-cushion-level':
                removeCushionLevel(target.dataset.level);
                break;
        }
    });
    
    document.body.addEventListener('change', (e) => {
        const target = e.target;
        const action = target.dataset.action;

        switch(action) {
            case 'update-role':
                updateUserRole(target.dataset.uid, target.value);
                break;
            case 'assign-cushion':
                const model = target.dataset.model;
                const selectedLevel = target.value;
                if (selectedLevel) {
                    appState.modelCushionAssignments[model] = selectedLevel;
                } else {
                    delete appState.modelCushionAssignments[model];
                }
                saveCushionData();
                break;
        }
    });

    document.body.addEventListener('dragstart', handleDragStart);
    document.body.addEventListener('dragend', handleDragEnd);
    document.body.addEventListener('dragover', handleDragOver);
    document.body.addEventListener('dragleave', handleDragLeave);
    document.body.addEventListener('drop', handleDrop);
}

function initializeModal(modalId, openBtnId, closeBtnId, onOpen) {
    const modal = getEl(modalId);
    const openBtn = getEl(openBtnId);
    const closeBtn = getEl(closeBtnId);
    if (!modal || !openBtn || !closeBtn) return;

    openBtn.addEventListener('click', () => {
        if (onOpen) onOpen();
        modal.classList.add('visible');
    });
    closeBtn.addEventListener('click', () => modal.classList.remove('visible'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('visible');
        }
    });
}

// --- App Initialization ---

async function initializeAppForUser() {
    setLoading(true, "Loading sites...");
    await loadSites();
    if (appState.sites.length > 0) {
        renderSiteSelector();
        const siteToSelect = appState.currentUser.homeSiteId || appState.sites[0].id;
        getEl('site-selector').value = siteToSelect;
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
    setLoading(true, `Loading data for ${getEl('site-selector').options[getEl('site-selector').selectedIndex].text}...`);
    
    // Reset state for the new site
    appState.finalSlottedData = {};
    appState.unslottedItems = [];
    appState.exclusionKeywords = [];
    
    // Define default settings
    const defaultSettings = {
        rackCount: 26, sectionsPerRack: 8, stacksPerSection: 5, slotsPerStack: 5,
        excludeRacks: '', includeKids: false, userInitials: '',
        colorMap: {
            'M': { name: 'Men', onHand: '#5468C1', po: '#a9b3e0' },
            'W': { name: 'Women', onHand: '#f846f0', po: '#fbc2f8' },
            'K': { name: 'Kids', onHand: '#64d669', po: '#b1ebc4' },
            'Y': { name: 'Kids', onHand: '#64d669', po: '#b1ebc4' }
        },
        cushionIndicatorColor: '#6b7280'
    };

    // Load site-specific and global data in parallel
    const [storedSettings, slottingData, cushionData, poSnapshot, exclusionData] = await Promise.all([
        loadDataFromFirestore(`sites/${appState.selectedSiteId}/configs/mainSettings`),
        loadDataFromFirestore(`sites/${appState.selectedSiteId}/slotting/current`),
        loadDataFromFirestore('configs/cushionData'),
        getDocs(collection(db, `sites/${appState.selectedSiteId}/purchaseOrders`)),
        loadDataFromFirestore(`sites/${appState.selectedSiteId}/configs/exclusionKeywords`)
    ]);

    // Apply settings
    const finalSettings = { ...defaultSettings, ...storedSettings };
    Object.keys(finalSettings).forEach(key => {
        const el = getEl(key);
        if (el) {
            if (el.type === 'checkbox') el.checked = finalSettings[key];
            else el.value = finalSettings[key];
        }
    });
    // Apply color settings
    Object.keys(finalSettings.colorMap).forEach(key => {
        const onHandEl = getEl(`color${toTitleCase(finalSettings.colorMap[key].name)}`);
        const poEl = getEl(`color${toTitleCase(finalSettings.colorMap[key].name)}PO`);
        if (onHandEl) onHandEl.value = finalSettings.colorMap[key].onHand;
        if (poEl) poEl.value = finalSettings.colorMap[key].po;
    });
    getEl('colorCushion').value = finalSettings.cushionIndicatorColor;

    // Update app state from loaded data
    appState.userInitials = finalSettings.userInitials;
    appState.colorMap = finalSettings.colorMap;
    appState.cushionIndicatorColor = finalSettings.cushionIndicatorColor;
    appState.finalSlottedData = slottingData?.data || {};
    appState.unslottedItems = slottingData?.unslotted || [];
    appState.cushionLevels = cushionData?.levels || [];
    appState.modelCushionAssignments = cushionData?.assignments || {};
    appState.allKnownModels = cushionData?.models || [];
    appState.loadedPOs = {};
    poSnapshot.forEach(doc => { appState.loadedPOs[doc.id] = doc.data(); });
    appState.exclusionKeywords = exclusionData?.keywords || [];
    
    // Render all UI components with the new state
    renderExclusionList();
    renderCushionUI();
    renderUI();
    renderMetricsPanel();
    renderUnslottedReport();
    renderPODetails();
    updateFilterDropdowns();
    updateUiForSiteSelection();
    setLoading(false);
}

// --- Handler Functions ---

function handleFileChange(event, nameElementId) {
    const file = event.target.files[0];
    const nameEl = getEl(nameElementId);
    if (nameEl) {
        nameEl.textContent = file?.name || 'No file chosen...';
        if (file) {
            nameEl.innerHTML += `<span class="text-gray-400 ml-2">(${ (file.size / 1024).toFixed(2) } KB)</span>`;
        }
    }
    checkFiles();
}

function handleMultiFileChange(event, nameContainerId, clearButtonId, type) {
    const files = event.target.files;
    const fileNamesContainer = getEl(nameContainerId);

    // MODIFIED: Store raw files in state
    if (type === 'inventory') appState.rawInventoryFiles = Array.from(files);
    if (type === 'po') appState.rawPOFiles = Array.from(files);

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
    appState.rawInventoryFiles = []; // Clear state
    getEl('inventoryFileNames').textContent = 'No files chosen...';
    getEl('clearInventoryBtn').classList.add('hidden');
    checkFiles();
    showToast("Loaded inventory files cleared.", "info");
}

function clearLoadedPOs() {
    getEl('poFile').value = '';
    appState.rawPOFiles = []; // Clear state
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
        // MODIFIED: Use files from state instead of reading from DOM
        const inventoryFiles = appState.rawInventoryFiles;
        const poFiles = appState.rawPOFiles;
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

// MODIFIED: Clear filters now just resets inputs and re-renders
function clearFilters() {
    getEl('brand-filter').value = '';
    getEl('model-filter').value = '';
    getEl('color-filter').value = '';
    getEl('size-filter').value = '';
    getEl('searchInput').value = '';

    updateFilterDropdowns(); // Reset dependent dropdowns
    renderUI(); // Re-render with no filters
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
    showConfirmationModal('Clear Site Data?', `This will clear all PO and Inventory data for ${getEl('site-selector').options[getEl('site-selector').selectedIndex].text}. This action cannot be undone.`, async () => {
        setLoading(true, `Clearing data for selected site...`);
        appState.finalSlottedData = {};
        appState.unslottedItems = [];
        appState.loadedPOs = {};
        
        await clearCollection(`sites/${appState.selectedSiteId}/purchaseOrders`);
        await deleteDocument(`sites/${appState.selectedSiteId}/slotting/current`);
        
        await initializeFromStorage(); // Reload to reflect cleared state
        setLoading(false);
        showToast(`PO and Inventory data for the site has been cleared.`, 'success');
    });
}

// Functions that were missing from the previous response but are called from event listeners
async function loadSites() {
    const sitesCollectionRef = collection(db, 'sites');
    const sitesSnapshot = await getDocs(sitesCollectionRef);
    appState.sites = sitesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    appState.sites.sort((a, b) => a.name.localeCompare(b.name));
}

async function createNewSite() {
    const newSiteNameInput = getEl('new-site-name');
    const newSiteName = newSiteNameInput.value.trim();
    if (!newSiteName) {
        showToast("Please enter a name for the new site.", "error");
        return;
    }
    setLoading(true, `Creating site: ${newSiteName}`);
    try {
        const siteId = newSiteName.toLowerCase().replace(/\s+/g, '-');
        await saveDataToFirestore(`sites/${siteId}`, { name: newSiteName });
        await loadSites();
        renderSiteManagementModal();
        renderSiteSelector();
        newSiteNameInput.value = '';
        showToast(`Site "${newSiteName}" created successfully!`, "success");
    } catch (error) {
        console.error("Error creating new site:", error);
        showToast("Could not create the new site.", "error");
    } finally {
        setLoading(false);
    }
}

async function deleteSite(siteId, siteName) {
    showConfirmationModal(`Delete ${siteName}?`, 'This will permanently delete the site and all its associated data (settings, slotting, POs). This action cannot be undone.', async () => {
        setLoading(true, `Deleting site: ${siteName}`);
        try {
            // This is a simplified deletion. A robust solution would use a Cloud Function
            // to recursively delete all subcollections.
            await deleteDocument(`sites/${siteId}/configs/mainSettings`);
            await deleteDocument(`sites/${siteId}/configs/exclusionKeywords`);
            await deleteDocument(`sites/${siteId}/slotting/current`);
            await clearCollection(`sites/${siteId}/purchaseOrders`);
            await deleteDocument(`sites/${siteId}`);

            await loadSites();
            renderSiteManagementModal();
            renderSiteSelector();
            
            if (appState.selectedSiteId === siteId) {
                appState.selectedSiteId = appState.sites.length > 0 ? appState.sites[0].id : null;
                getEl('site-selector').value = appState.selectedSiteId;
                await initializeFromStorage();
            }
            showToast(`Site "${siteName}" has been deleted.`, "success");
        } catch (error) {
            console.error(`Error deleting site ${siteId}:`, error);
            showToast("An error occurred while deleting the site.", "error");
        } finally {
            setLoading(false);
        }
    });
}

async function setHomeSite() {
    if (!appState.selectedSiteId) {
        showToast("Please select a site to set as home.", "error");
        return;
    }
    setLoading(true, "Setting home site...");
    try {
        await saveDataToFirestore(`users/${appState.currentUser.uid}`, { homeSiteId: appState.selectedSiteId });
        appState.currentUser.homeSiteId = appState.selectedSiteId;
        showToast(`${getEl('site-selector').options[getEl('site-selector').selectedIndex].text} is now your home site.`, "success");
    } catch (error) {
        console.error("Error setting home site:", error);
        showToast("Could not set home site.", "error");
    } finally {
        setLoading(false);
    }
}

async function handleApprovalAction(uid, action) {
    const status = action === 'approved' ? 'approved' : 'denied';
    setLoading(true, `Updating user status to ${status}...`);
    try {
        await saveDataToFirestore(`users/${uid}`, {
            status: status,
            approvedBy: appState.currentUser.email,
            approvalTimestamp: serverTimestamp()
        });
        renderUserManagementModal();
        showToast(`User has been ${status}.`, 'success');
    } catch (error) {
        console.error(`Error ${action}ing user:`, error);
        showToast("Could not update user status.", "error");
    } finally {
        setLoading(false);
    }
}

async function deleteUser(uid, email) {
    showConfirmationModal(`Delete user ${email}?`, 'This will permanently remove the user from the system. They will need to sign up again to request access.', async () => {
        setLoading(true, `Deleting user ${email}...`);
        try {
            await deleteDocument(`users/${uid}`);
            renderUserManagementModal();
            showToast(`User ${email} has been deleted.`, 'success');
        } catch (error) {
            console.error("Error deleting user:", error);
            showToast("Could not delete user.", "error");
        } finally {
            setLoading(false);
        }
    });
}

async function updateUserRole(uid, role) {
    setLoading(true, `Updating role...`);
    try {
        await saveDataToFirestore(`users/${uid}`, { role: role });
        renderUserManagementModal();
        showToast(`User role updated to ${role}.`, 'success');
    } catch (error) {
        console.error("Error updating user role:", error);
        showToast("Could not update user role.", "error");
    } finally {
        setLoading(false);
    }
}

async function markPOAsReceived(poKey) {
    showConfirmationModal('Mark PO as Received?', `This will remove all items from PO "${poKey}" from the inbound list.`, async () => {
        setLoading(true, `Receiving PO: ${poKey}`);
        try {
            await deleteDocument(`sites/${appState.selectedSiteId}/purchaseOrders/${poKey}`);
            delete appState.loadedPOs[poKey];
            renderPODetails();
            showToast(`PO "${poKey}" marked as received.`, 'success');
        } catch (error) {
            console.error(`Error receiving PO ${poKey}:`, error);
            showToast("An error occurred while receiving the PO.", "error");
        } finally {
            setLoading(false);
        }
    });
}

async function saveCushionData() {
    await saveDataToFirestore('configs/cushionData', {
        levels: appState.cushionLevels,
        assignments: appState.modelCushionAssignments,
        models: appState.allKnownModels
    });
}

function handleDragStart(e) {
    if (e.target.classList.contains('detail-slot') && e.target.draggable) {
        e.dataTransfer.setData('text/plain', e.target.dataset.locationId);
        e.target.classList.add('dragging');
    }
    if (e.target.classList.contains('cushion-level-item')) {
        e.dataTransfer.setData('text/level', e.target.dataset.level);
        e.target.classList.add('dragging');
    }
}

function handleDragEnd(e) {
    if (e.target.classList.contains('detail-slot')) {
        e.target.classList.remove('dragging');
    }
    if (e.target.classList.contains('cushion-level-item')) {
        e.target.classList.remove('dragging');
    }
}

function handleDragOver(e) {
    e.preventDefault();
    const targetSlot = e.target.closest('.detail-slot');
    if (targetSlot) {
        targetSlot.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    const targetSlot = e.target.closest('.detail-slot');
    if (targetSlot) {
        targetSlot.classList.remove('drag-over');
    }
}

async function handleDrop(e) {
    e.preventDefault();
    const draggedLevel = e.dataTransfer.getData('text/level');
    if (draggedLevel) {
        handleCushionLevelDrop(e, draggedLevel);
        return;
    }
    
    const draggedLocationId = e.dataTransfer.getData('text/plain');
    const targetSlot = e.target.closest('.detail-slot');
    if (targetSlot) {
        targetSlot.classList.remove('drag-over');
        const targetLocationId = targetSlot.dataset.locationId;
        if (draggedLocationId && targetLocationId && draggedLocationId !== targetLocationId) {
            const item1 = appState.finalSlottedData[draggedLocationId];
            const item2 = appState.finalSlottedData[targetLocationId];
            
            // Swap items in the state
            if (item2) {
                appState.finalSlottedData[draggedLocationId] = item2;
                item2.LocationID = draggedLocationId;
            } else {
                delete appState.finalSlottedData[draggedLocationId];
            }
            appState.finalSlottedData[targetLocationId] = item1;
            item1.LocationID = targetLocationId;
            
            // Re-render and save
            renderUI();
            await saveDataToFirestore(`sites/${appState.selectedSiteId}/slotting/current`, { data: appState.finalSlottedData });
            showToast('Items swapped.', 'success');
        }
    }
}

async function handleCushionLevelDrop(e, draggedLevel) {
    const targetItem = e.target.closest('.cushion-level-item');
    if (targetItem) {
        const targetLevel = targetItem.dataset.level;
        const draggedIndex = appState.cushionLevels.indexOf(draggedLevel);
        const targetIndex = appState.cushionLevels.indexOf(targetLevel);
        if (draggedIndex > -1 && targetIndex > -1) {
            // Remove and insert to reorder
            const [removed] = appState.cushionLevels.splice(draggedIndex, 1);
            appState.cushionLevels.splice(targetIndex, 0, removed);
            
            renderCushionUI();
            await saveCushionData();
        }
    }
}
