/**
 * @file main.js
 * @description The main entry point for the application.
 * This file orchestrates the application flow, initializes modules,
 * and sets up all major event listeners.
 */

// State and Firebase
import { appState } from './state.js';
import { db } from './firebase.js';
import { serverTimestamp, collection, writeBatch, doc, getDocs, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// API and Logic
import { saveDataToFirestore, loadDataFromFirestore, deleteDocument, clearCollection, loadCollectionAsMap, batchSaveToCollection } from './api.js';
import { runLocalSlottingAlgorithm, parsePOFiles, parseItemString } from './slotting.js';
import { initializeAuthListener, handleGoogleSignIn, handleSignUp, handleSignIn, handleSignOut } from './auth.js';
import { getEl, readFileAsText, downloadFile, generateUniqueFilename, generateCSV, toTitleCase, robustCSVParse, createHeaderMap } from './utils.js';

// UI
import {
    showToast, setLoading, showConfirmationModal,
    renderUI, renderPODetails, renderUnslottedReport, renderExclusionList, renderCushionUI,
    renderSiteManagementModal, renderUserManagementModal, renderMetricsPanel, updateModelAssignmentList,
    adjustUiForRole, updateUiForSiteSelection, renderSiteSelector, updateFilterDropdowns, checkFiles,
    toggleView, renderRackConfigurationModal, renderRackTypeLibrary, renderSiteRackLayout
} from './ui.js';

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    initializeAuthListener();
    initializeEventListeners();
});

function applyBackgroundPattern(opacityValue, densityValue) {
    const opacity = (parseInt(opacityValue, 10) || 0) / 100;
    const density = parseInt(densityValue, 10) || 200;

    if (opacity === 0) {
        document.body.style.backgroundImage = 'none';
        return;
    }

    const svgLogoPath = "M131.55 43.5l120.31 0c38.05,0 69.17,31.12 69.17,69.16l0 48.27 -71.58 0 0 -34.4c0,-9.14 -7.47,-16.62 -16.61,-16.62l-80.64 0c-9.14,0 -16.61,7.48 -16.61,16.62l0 191.26c0,9.14 7.47,16.61 16.61,16.61l80.64 0c9.14,0 16.61,-7.47 16.61,-16.61l0 -51.11 -66.95 0 34.12 -64.66c34.85,0 69.38,-0.27 104.41,-0.27l0 131.31c0,38.05 -31.12,69.17 -69.17,69.17l-120.31 0c-38.05,0 -69.17,-31.12 -69.17,-69.17l0 -220.4c0,-38.04 31.12,-69.16 69.17,-69.16zM733.12 44.69l137.26 0c38.04,0 69.16,31.13 69.16,69.17l0 220.4c0,38.04 -31.12,69.17 -69.16,69.17l-137.26 0c-38.04,0 -69.17,-31.13 -69.17,-69.17l0 -220.4c0,-38.04 31.13,-69.17 69.17,-69.17zm17.55 66.86l102.16 0c8.87,0 16.12,7.26 16.12,16.13l0 192.76c0,8.87 -7.25,16.13 -16.12,16.13l-102.16 0c-8.87,0 -16.13,-7.26 -16.13,-16.13l0 -192.76c0,-8.87 7.26,-16.13 16.13,-16.13zM566.17 46.6l70.58 0 0 354.03 -43.8 0c-7.27,-10.53 -16.35,-19.66 -26.78,-26.94l0 -108.13 -120.29 0 0 109.02c-9.9,7.13 -18.54,15.95 -25.52,26.05l-45.05 0 0 -135.07 -51.92 0 34.13 -64.66 17.79 0 0 -154.76 70.57 0 0 154.76 120.29 0 0 -154.3zM94.41 411.72l334.16 0c16.43,-26.24 45.26,-43.64 78.08,-43.64 32.83,0 61.66,17.4 78.09,43.64l317.99 0c18.68,0 33.96,15.28 33.96,33.96l0 37.09c0,18.67 -15.28,33.95 -33.96,33.95l-320.54 0c-16.76,24.07 -44.35,39.78 -75.54,39.78 -31.18,0 -58.77,-15.71 -75.53,-39.78l-336.71 0c-18.67,0 -33.95,-15.28 -33.95,-33.95l0 -37.09c0,-18.68 15.28,-33.96 33.95,-33.96z";
    const svgDataUrl = `data:image/svg+xml,%3Csvg width='150' height='150' viewBox='0 0 1000 600' xmlns='http://www.w3.org/2000/svg'%3E%3Cg opacity='${opacity}'%3E%3Cpath fill='%23373435' d='${svgLogoPath}'/%3E%3C/g%3E%3C/svg%3E`;

    document.body.style.backgroundImage = `url("${svgDataUrl}")`;
    document.body.style.backgroundSize = `${density}px ${density}px`;
}

function initializeEventListeners() {
    // Auth
    getEl('login-btn').addEventListener('click', handleSignIn);
    getEl('google-login-btn').addEventListener('click', handleGoogleSignIn);
    getEl('signup-btn').addEventListener('click', handleSignUp);
    getEl('logout-btn').addEventListener('click', handleSignOut);

    document.addEventListener('user-authenticated', initializeAppForUser);

    // File Inputs
    getEl('prevSlottingFile').addEventListener('change', (e) => handleFileChange(e, 'prevSlottingFileName'));
    getEl('inventoryFile').addEventListener('change', (e) => handleMultiFileChange(e, 'inventoryFileNames', 'clearInventoryBtn', 'inventory'));
    getEl('poFile').addEventListener('change', (e) => {
        handleMultiFileChange(e, 'poFileNames', 'clearPOsBtn', 'po');
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

    getEl('search-btn').addEventListener('click', renderUI);
    getEl('clearFiltersBtn').addEventListener('click', clearFilters);
    getEl('brand-filter').addEventListener('change', () => { updateFilterDropdowns(); renderUI(); });
    getEl('model-filter').addEventListener('change', () => { updateFilterDropdowns(); renderUI(); });
    getEl('color-filter').addEventListener('change', () => { updateFilterDropdowns(); renderUI(); });
    getEl('size-filter').addEventListener('change', () => { renderUI(); });
    getEl('searchInput').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') renderUI();
    });

    getEl('clearInventoryBtn').addEventListener('click', clearLoadedInventory);
    getEl('clearPOsBtn').addEventListener('click', clearLoadedPOs);
    getEl('add-exclusion-btn').addEventListener('click', addExclusionKeyword);
    getEl('add-cushion-level-btn').addEventListener('click', addCushionLevel);

    getEl('invTemplateBtn').addEventListener('click', (e) => { e.preventDefault(); downloadFile(`"System ID","UPC","EAN","Custom SKU","Manufact. SKU","Item","Remaining","total cost","avg. cost","sale price","margin"\n"ignore","ignore","ignore","ignore","ignore","Cloudsurfer | Undyed/White 11.5","2","ignore","ignore","ignore","ignore"`, 'inventory_template.csv'); });
    getEl('poTemplateBtn').addEventListener('click', (e) => { e.preventDefault(); downloadFile(`"PO Number","Item","Quantity","Checked In"\n"12345","Cloud 5 | Black/White 10.5","5","0"`, 'po_template.csv'); });

    // Modals
    initializeModal('settings-modal', 'open-settings-btn', 'close-settings-btn');
    initializeModal('user-management-modal', 'open-user-management-btn', 'close-user-management-btn', renderUserManagementModal);
    initializeModal('site-management-modal', 'open-site-management-btn', 'close-site-management-btn', renderSiteManagementModal);
    initializeModal('rack-config-modal', 'open-rack-config-btn', 'close-rack-config-btn', renderRackConfigurationModal);
    
    getEl('save-settings-btn').addEventListener('click', () => {
        saveSettings();
        getEl('settings-modal').classList.remove('visible');
    });
    getEl('clear-cushion-data-btn').addEventListener('click', clearCushionData);
    getEl('clear-site-slotting-data-btn').addEventListener('click', clearSiteSlottingData);

    getEl('create-site-btn').addEventListener('click', createNewSite);
    getEl('set-home-site-btn').addEventListener('click', setHomeSite);
    getEl('site-selector').addEventListener('change', (e) => {
        appState.selectedSiteId = e.target.value;
        initializeFromStorage();
    });
    
    // Rack Config Modal Listeners
    getEl('add-rack-type-btn').addEventListener('click', handleAddOrEditRackType);
    getEl('save-rack-config-btn').addEventListener('click', saveRackConfiguration);
    getEl('cancel-rack-config-btn').addEventListener('click', () => getEl('rack-config-modal').classList.remove('visible'));


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

    document.body.addEventListener('click', (e) => {
        const target = e.target;
        const actionTarget = target.closest('[data-action]');
        if (!actionTarget) return;
        
        const action = actionTarget.dataset.action;
        const { siteId, siteName, poKey, keyword, rackId, uid, email, level, typeName, index } = actionTarget.dataset;

        switch(action) {
            case 'delete-site': deleteSite(siteId, siteName); break;
            case 'receive-po': markPOAsReceived(poKey); break;
            case 'remove-exclusion': removeExclusionKeyword(keyword); break;
            case 'select-rack-title': appState.selectedRackId = parseInt(rackId); toggleView(); break;
            case 'select-rack': appState.selectedRackId = parseInt(rackId); renderUI(); break;
            case 'approve-user': handleApprovalAction(uid, 'approved'); break;
            case 'deny-user': handleApprovalAction(uid, 'denied'); break;
            case 'delete-user': deleteUser(uid, email); break;
            case 'remove-cushion-level': removeCushionLevel(level); break;
            case 'delete-rack-type': deleteRackType(typeName); break;
            case 'add-type-to-site': addRackTypeToSite(typeName); break;
            case 'remove-type-from-site': removeRackTypeFromSite(parseInt(index)); break;
        }
    });
    
    document.body.addEventListener('change', (e) => {
        const target = e.target;
        const action = target.dataset.action;
        if (!action) return;

        const { uid, model, index } = target.dataset;

        switch(action) {
            case 'update-role': updateUserRole(uid, target.value); break;
            case 'assign-cushion':
                const selectedLevel = target.value;
                if (selectedLevel) appState.modelCushionAssignments[model] = selectedLevel;
                else delete appState.modelCushionAssignments[model];
                saveCushionData();
                break;
            case 'update-layout-quantity':
                updateLayoutQuantity(parseInt(index), parseInt(target.value));
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
        
        let siteToSelect = appState.currentUser.homeSiteId;
        const homeSiteExists = siteToSelect && appState.sites.some(site => site.id === siteToSelect);

        if (!homeSiteExists) {
            siteToSelect = appState.sites[0].id;
        }

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
    
    const siteSelector = getEl('site-selector');
    const selectedSiteName = siteSelector.options[siteSelector.selectedIndex]?.text || 'the selected site';
    setLoading(true, `Loading data for ${selectedSiteName}...`);
    
    appState.finalSlottedData = {};
    appState.unslottedItems = [];
    appState.exclusionKeywords = [];
    
    const defaultSettings = {
        userInitials: '', includeKids: false, excludeRacks: '',
        colorMap: {
            'M': { name: 'Men', onHand: '#5468C1', po: '#a9b3e0' },
            'W': { name: 'Women', onHand: '#f846f0', po: '#fbc2f8' },
            'K': { name: 'Kids', onHand: '#64d669', po: '#b1ebc4' },
            'Y': { name: 'Kids', onHand: '#64d669', po: '#b1ebc4' }
        },
        cushionIndicatorColor: '#6b7280',
        bgOpacity: 5, bgDensity: 200
    };

    const [
        storedSettings, rackConfig, rackLibrary, slottingData, 
        unslottedData, cushionData, poSnapshot, exclusionData
    ] = await Promise.all([
        loadDataFromFirestore(`sites/${appState.selectedSiteId}/configs/mainSettings`),
        loadDataFromFirestore(`sites/${appState.selectedSiteId}/configs/rackConfiguration`),
        loadDataFromFirestore('configs/rackTypeLibrary'),
        loadCollectionAsMap(`sites/${appState.selectedSiteId}/slotting`),
        loadDataFromFirestore(`sites/${appState.selectedSiteId}/reports/unslotted`),
        loadDataFromFirestore('configs/cushionData'),
        getDocs(collection(db, `sites/${appState.selectedSiteId}/purchaseOrders`)),
        loadDataFromFirestore(`sites/${appState.selectedSiteId}/configs/exclusionKeywords`)
    ]);

    const finalSettings = { ...defaultSettings, ...storedSettings };
    Object.keys(finalSettings).forEach(key => {
        const el = getEl(key);
        if (el) {
            if (el.type === 'checkbox') el.checked = finalSettings[key];
            else el.value = finalSettings[key];
        }
    });
    Object.keys(finalSettings.colorMap).forEach(key => {
        const deptName = finalSettings.colorMap[key].name;
        const onHandEl = getEl(`color${deptName}`);
        const poEl = getEl(`color${deptName}PO`);
        if (onHandEl) onHandEl.value = finalSettings.colorMap[key].onHand;
        if (poEl) poEl.value = finalSettings.colorMap[key].po;
    });
    getEl('colorCushion').value = finalSettings.cushionIndicatorColor;

    applyBackgroundPattern(finalSettings.bgOpacity, finalSettings.bgDensity);

    appState.userInitials = finalSettings.userInitials;
    appState.colorMap = finalSettings.colorMap;
    appState.cushionIndicatorColor = finalSettings.cushionIndicatorColor;
    appState.siteRackLayout = rackConfig?.layout || [];
    appState.rackTypeLibrary = rackLibrary?.types || [];
    appState.finalSlottedData = slottingData || {};
    appState.unslottedItems = unslottedData?.items || [];
    appState.cushionLevels = cushionData?.levels || [];
    appState.modelCushionAssignments = cushionData?.assignments || {};
    appState.allKnownModels = cushionData?.models || [];
    appState.loadedPOs = {};
    poSnapshot.forEach(doc => { appState.loadedPOs[doc.id] = doc.data(); });
    appState.exclusionKeywords = exclusionData?.keywords || [];
    
    renderExclusionList();
    renderCushionUI();
    renderUI();
    renderMetricsPanel();
    renderUnslottedReport();
    renderPODetails();
    updateFilterDropdowns();
    updateUiForSiteSelection();

    if (Object.keys(appState.finalSlottedData).length > 0) {
        getEl('viewToggleBtn').disabled = false;
        getEl('downloadPdfBtn').disabled = false;
        getEl('downloadCsvBtn').disabled = false;
    }

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
            nameEl.classList.add('file-success-flash');
            setTimeout(() => nameEl.classList.remove('file-success-flash'), 700);
        }
    }
    checkFiles();
}

function handleMultiFileChange(event, nameContainerId, clearButtonId, type) {
    const files = event.target.files;
    const fileNamesContainer = getEl(nameContainerId);

    if (type === 'inventory') appState.rawInventoryFiles = Array.from(files);
    if (type === 'po') appState.rawPOFiles = Array.from(files);

    if (files.length > 0) {
        fileNamesContainer.innerHTML = Array.from(files).map(f => `<div class="truncate" title="${f.name}">${f.name}</div>`).join('');
        getEl(clearButtonId).classList.remove('hidden');
        fileNamesContainer.classList.add('file-success-flash');
        setTimeout(() => fileNamesContainer.classList.remove('file-success-flash'), 700);
    } else {
        fileNamesContainer.textContent = 'No files chosen...';
        getEl(clearButtonId).classList.add('hidden');
    }
    checkFiles();
}

function clearLoadedInventory() {
    getEl('inventoryFile').value = '';
    appState.rawInventoryFiles = [];
    getEl('inventoryFileNames').textContent = 'No files chosen...';
    getEl('clearInventoryBtn').classList.add('hidden');
    checkFiles();
    showToast("Loaded inventory files cleared.", "info");
}

function clearLoadedPOs() {
    getEl('poFile').value = '';
    appState.rawPOFiles = [];
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
        
        const clearInventory = getEl('clear-inventory-checkbox').checked;
        const existingBackroom = clearInventory ? {} : { ...appState.finalSlottedData };

        const result = runLocalSlottingAlgorithm({
            inventoryData,
            poData,
            previousSlottingData: !clearInventory ? previousSlottingData : null,
            existingBackroom,
            settings: {
                siteRackLayout: appState.siteRackLayout,
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

        const slottingCollectionPath = `sites/${appState.selectedSiteId}/slotting`;
        if (clearInventory) {
            await clearCollection(slottingCollectionPath);
        }
        await batchSaveToCollection(slottingCollectionPath, appState.finalSlottedData);
        
        const unslottedReport = {
            items: appState.unslottedItems,
            lastUpdated: serverTimestamp(),
            updatedBy: appState.currentUser.email
        };
        await saveDataToFirestore(`sites/${appState.selectedSiteId}/reports/unslotted`, unslottedReport, false);

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
    
    appState.colorMap['M'].onHand = getEl('colorMen').value;
    appState.colorMap['M'].po = getEl('colorMenPO').value;
    appState.colorMap['W'].onHand = getEl('colorWomen').value;
    appState.colorMap['W'].po = getEl('colorWomenPO').value;
    const kidsOnHandColor = getEl('colorKids').value;
    const kidsPOColor = getEl('colorKidsPO').value;
    appState.colorMap['K'].onHand = kidsOnHandColor;
    appState.colorMap['K'].po = kidsPOColor;
    appState.colorMap['Y'].onHand = kidsOnHandColor;
    appState.colorMap['Y'].po = kidsPOColor;
    appState.cushionIndicatorColor = getEl('colorCushion').value;
    
    const bgOpacity = getEl('bgOpacity').value;
    const bgDensity = getEl('bgDensity').value;
    
    appState.userInitials = getEl('userInitials').value.toUpperCase();
    const settings = {
        excludeRacks: getEl('excludeRacks').value,
        includeKids: getEl('includeKids').checked,
        userInitials: appState.userInitials,
        colorMap: appState.colorMap,
        cushionIndicatorColor: appState.cushionIndicatorColor,
        bgOpacity: bgOpacity,
        bgDensity: bgDensity
    };
    await saveDataToFirestore(`sites/${appState.selectedSiteId}/configs/mainSettings`, settings);
    
    applyBackgroundPattern(bgOpacity, bgDensity);

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
    getEl('cushionModelFile').value = '';
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
        
        await clearCollection(`sites/${appState.selectedSiteId}/slotting`);
        await clearCollection(`sites/${appState.selectedSiteId}/purchaseOrders`);
        await deleteDocument(`sites/${appState.selectedSiteId}/reports/unslotted`);
        
        await initializeFromStorage();
        setLoading(false);
        showToast(`PO and Inventory data for the site has been cleared.`, 'success');
    });
}

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
            await clearCollection(`sites/${siteId}/slotting`);
            await clearCollection(`sites/${siteId}/purchaseOrders`);
            await deleteDocument(`sites/${siteId}/configs/mainSettings`);
            await deleteDocument(`sites/${siteId}/configs/rackConfiguration`);
            await deleteDocument(`sites/${siteId}/configs/exclusionKeywords`);
            await deleteDocument(`sites/${siteId}/reports/unslotted`);
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
    showConfirmationModal(`Disable user ${email}?`, 'This will prevent the user from logging in. Their account data will be kept but their status will be set to "denied".', async () => {
        setLoading(true, `Disabling user ${email}...`);
        try {
            const userRef = doc(db, 'users', uid);
            await updateDoc(userRef, { status: 'denied' });
            
            renderUserManagementModal();
            showToast(`User ${email} has been disabled.`, 'success');
        } catch (error) {
            console.error("Error disabling user:", error);
            showToast("Could not disable user.", "error");
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

// --- Rack Configuration Logic ---

function handleAddOrEditRackType() {
    showConfirmationModal(
        'Add New Rack Type',
        `<div class="space-y-4 text-left">
            <div>
                <label for="rackTypeName" class="block text-sm font-medium text-gray-700">Rack Type Name</label>
                <input type="text" id="rackTypeName" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" placeholder="e.g., Standard Shoe Wall">
            </div>
            <div class="grid grid-cols-3 gap-4">
                <div>
                    <label for="rackTypeSections" class="block text-sm font-medium text-gray-700">Sections</label>
                    <input type="number" id="rackTypeSections" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" value="8">
                </div>
                <div>
                    <label for="rackTypeStacks" class="block text-sm font-medium text-gray-700">Stacks</label>
                    <input type="number" id="rackTypeStacks" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" value="5">
                </div>
                <div>
                    <label for="rackTypeSlots" class="block text-sm font-medium text-gray-700">Slots</label>
                    <input type="number" id="rackTypeSlots" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" value="5">
                </div>
            </div>
        </div>`,
        async () => {
            const name = getEl('rackTypeName').value.trim();
            const sections = parseInt(getEl('rackTypeSections').value);
            const stacks = parseInt(getEl('rackTypeStacks').value);
            const slots = parseInt(getEl('rackTypeSlots').value);

            if (!name || isNaN(sections) || isNaN(stacks) || isNaN(slots)) {
                showToast("Please fill out all fields for the rack type.", "error");
                return;
            }
            if (appState.rackTypeLibrary.some(t => t.name === name)) {
                showToast("A rack type with this name already exists.", "error");
                return;
            }

            appState.rackTypeLibrary.push({ name, sectionsPerRack: sections, stacksPerSection: stacks, slotsPerStack: slots });
            await saveDataToFirestore('configs/rackTypeLibrary', { types: appState.rackTypeLibrary });
            renderRackTypeLibrary();
            showToast(`Rack type "${name}" created.`, "success");
        }
    );
}

async function deleteRackType(typeName) {
    if (appState.siteRackLayout.some(block => block.typeName === typeName)) {
        showToast(`Cannot delete "${typeName}" as it is currently in use by this site's layout.`, "error");
        return;
    }
    showConfirmationModal(`Delete Rack Type "${typeName}"?`, 'This will permanently remove this template from the library.', async () => {
        appState.rackTypeLibrary = appState.rackTypeLibrary.filter(t => t.name !== typeName);
        await saveDataToFirestore('configs/rackTypeLibrary', { types: appState.rackTypeLibrary });
        renderRackTypeLibrary();
        showToast(`Rack type "${typeName}" deleted.`, "success");
    });
}

function addRackTypeToSite(typeName) {
    const type = appState.rackTypeLibrary.find(t => t.name === typeName);
    if (type) {
        appState.siteRackLayout.push({
            typeName: type.name,
            quantity: 1,
            sectionsPerRack: type.sectionsPerRack,
            stacksPerSection: type.stacksPerSection,
            slotsPerStack: type.slotsPerStack
        });
        renderSiteRackLayout();
    }
}

function removeRackTypeFromSite(index) {
    appState.siteRackLayout.splice(index, 1);
    renderSiteRackLayout();
}

function updateLayoutQuantity(index, quantity) {
    if (appState.siteRackLayout[index]) {
        appState.siteRackLayout[index].quantity = Math.max(0, quantity); // Ensure quantity isn't negative
        renderSiteRackLayout();
    }
}

async function saveRackConfiguration() {
    const oldTotalRacks = appState.siteRackLayout.reduce((sum, block) => sum + block.quantity, 0);
    const newLayout = [];
    const layoutContainer = getEl('site-layout-container');
    const items = layoutContainer.querySelectorAll('.site-layout-item');
    items.forEach(item => {
        const index = parseInt(item.dataset.index);
        const originalBlock = appState.siteRackLayout[index];
        const quantity = parseInt(item.querySelector('input[type="number"]').value);
        newLayout.push({ ...originalBlock, quantity });
    });
    
    const newTotalRacks = newLayout.reduce((sum, block) => sum + block.quantity, 0);

    const confirmAndSave = async () => {
        setLoading(true, "Saving new rack layout...");
        appState.siteRackLayout = newLayout;
        await saveDataToFirestore(`sites/${appState.selectedSiteId}/configs/rackConfiguration`, { layout: appState.siteRackLayout });

        // If racks were removed, find and unslot items from the removed racks
        if (newTotalRacks < oldTotalRacks) {
            const itemsToUnslot = {};
            const batch = writeBatch(db);
            Object.entries(appState.finalSlottedData).forEach(([loc, item]) => {
                const rackNum = parseInt(loc.split('-')[0]);
                if (rackNum > newTotalRacks) {
                    itemsToUnslot[loc] = item;
                    batch.delete(doc(db, `sites/${appState.selectedSiteId}/slotting/${loc}`));
                }
            });
            
            Object.keys(itemsToUnslot).forEach(loc => delete appState.finalSlottedData[loc]);
            const unslottedItems = Object.values(itemsToUnslot);
            appState.unslottedItems.push(...unslottedItems);

            await batch.commit();
            await saveDataToFirestore(`sites/${appState.selectedSiteId}/reports/unslotted`, { items: appState.unslottedItems }, false);
        }
        
        setLoading(false);
        getEl('rack-config-modal').classList.remove('visible');
        showToast("Rack layout saved successfully!", "success");
        renderUI();
        renderMetricsPanel();
    };

    if (newTotalRacks < oldTotalRacks) {
        showConfirmationModal(
            'Confirm Rack Reduction',
            `You are reducing the total number of racks from ${oldTotalRacks} to ${newTotalRacks}.<br><br>All items currently in racks ${newTotalRacks + 1} to ${oldTotalRacks} will be unslotted.`,
            confirmAndSave
        );
    } else {
        appState.siteRackLayout = newLayout; // Update state immediately for reordering
        await confirmAndSave();
    }
}


// --- Drag and Drop ---

function handleDragStart(e) {
    const dragTarget = e.target.closest('[draggable="true"]');
    if (!dragTarget) return;

    if (dragTarget.classList.contains('detail-slot')) {
        e.dataTransfer.setData('text/plain', dragTarget.dataset.locationId);
        dragTarget.classList.add('dragging');
    }
    if (dragTarget.classList.contains('cushion-level-item')) {
        e.dataTransfer.setData('text/level', dragTarget.dataset.level);
        dragTarget.classList.add('dragging');
    }
    if (dragTarget.classList.contains('site-layout-item')) {
        e.dataTransfer.setData('text/layout-index', dragTarget.dataset.index);
        dragTarget.classList.add('dragging');
    }
}

function handleDragEnd(e) {
    const dragTarget = e.target.closest('[draggable="true"]');
    if (dragTarget) {
       dragTarget.classList.remove('dragging');
    }
}

function handleDragOver(e) {
    e.preventDefault();
    const dropTarget = e.target.closest('.detail-slot, .site-layout-item');
    if (dropTarget) {
        dropTarget.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    const dropTarget = e.target.closest('.detail-slot, .site-layout-item');
    if (dropTarget) {
        dropTarget.classList.remove('drag-over');
    }
}

async function handleDrop(e) {
    e.preventDefault();
    const draggedLevel = e.dataTransfer.getData('text/level');
    const draggedLocationId = e.dataTransfer.getData('text/plain');
    const draggedLayoutIndex = e.dataTransfer.getData('text/layout-index');
    
    const dropTarget = e.target.closest('.detail-slot, .cushion-level-item, .site-layout-item');
    if(dropTarget) dropTarget.classList.remove('drag-over');

    if (draggedLevel && dropTarget?.classList.contains('cushion-level-item')) {
        handleCushionLevelDrop(e, draggedLevel);
    } else if (draggedLocationId && dropTarget?.classList.contains('detail-slot')) {
        handleSlotDrop(e, draggedLocationId);
    } else if (draggedLayoutIndex && dropTarget?.classList.contains('site-layout-item')) {
        handleLayoutDrop(e, draggedLayoutIndex);
    }
}

async function handleSlotDrop(e, draggedLocationId) {
    const targetSlot = e.target.closest('.detail-slot');
    if (targetSlot) {
        const targetLocationId = targetSlot.dataset.locationId;
        if (draggedLocationId && targetLocationId && draggedLocationId !== targetLocationId) {
            const item1 = appState.finalSlottedData[draggedLocationId];
            const item2 = appState.finalSlottedData[targetLocationId];
            
            const batch = writeBatch(db);

            if (item2) {
                appState.finalSlottedData[draggedLocationId] = item2;
                item2.LocationID = draggedLocationId;
                batch.set(doc(db, `sites/${appState.selectedSiteId}/slotting/${draggedLocationId}`), item2);
            } else {
                delete appState.finalSlottedData[draggedLocationId];
                batch.delete(doc(db, `sites/${appState.selectedSiteId}/slotting/${draggedLocationId}`));
            }
            
            appState.finalSlottedData[targetLocationId] = item1;
            item1.LocationID = targetLocationId;
            batch.set(doc(db, `sites/${appState.selectedSiteId}/slotting/${targetLocationId}`), item1);
            
            renderUI();
            await batch.commit();
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
            const [removed] = appState.cushionLevels.splice(draggedIndex, 1);
            appState.cushionLevels.splice(targetIndex, 0, removed);
            
            renderCushionUI();
            await saveCushionData();
        }
    }
}

function handleLayoutDrop(e, draggedIndexStr) {
    const targetItem = e.target.closest('.site-layout-item');
    if (targetItem) {
        const draggedIndex = parseInt(draggedIndexStr);
        const targetIndex = parseInt(targetItem.dataset.index);
        if (!isNaN(draggedIndex) && !isNaN(targetIndex) && draggedIndex !== targetIndex) {
            const [removed] = appState.siteRackLayout.splice(draggedIndex, 1);
            appState.siteRackLayout.splice(targetIndex, 0, removed);
            renderSiteRackLayout();
        }
    }
}
