/**
 * @file ui.js
 * @description Manages all DOM manipulation, UI rendering, and user feedback functions.
 * This module is now purely for rendering and does not contain event handling logic.
 */

import { appState } from './state.js';
import { getEl, toTitleCase } from './utils.js';
import { db } from './firebase.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";


// --- UI Feedback (Toast, Loader, Modal) ---

export function showToast(message, type = 'info') {
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

export function setLoading(isLoading, message = '') {
    const overlay = getEl('loading-overlay');
    if (overlay) {
        overlay.style.display = isLoading ? 'flex' : 'none';
        getEl('loading-message').textContent = message;
    }
}

export function showConfirmationModal(title, message, onConfirm) {
    const modal = getEl('confirmation-modal');
    getEl('confirmation-title').textContent = title;
    getEl('confirmation-message').textContent = message;
    modal.classList.add('visible');

    const confirmBtn = getEl('confirmation-confirm-btn');
    const cancelBtn = getEl('confirmation-cancel-btn');

    // Use .cloneNode to remove previous listeners
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    const confirmHandler = () => {
        onConfirm();
        closeModal();
    };

    const closeModal = () => {
        modal.classList.remove('visible');
    };

    newConfirmBtn.addEventListener('click', confirmHandler);
    newCancelBtn.addEventListener('click', closeModal);
}

// --- Main Rendering Functions ---

export function renderUI() {
    // MODIFIED: Moved search/filter logic here from main.js
    const searchTerm = getEl('searchInput')?.value.toLowerCase().trim() || '';
    const brandFilter = getEl('brand-filter').value;
    const modelFilter = getEl('model-filter').value;
    const colorFilter = getEl('color-filter').value;
    const sizeFilter = getEl('size-filter').value;

    const isFiltering = searchTerm || brandFilter || modelFilter || colorFilter || sizeFilter;
    let filteredData = appState.finalSlottedData;

    if (isFiltering) {
        filteredData = Object.entries(appState.finalSlottedData).reduce((acc, [loc, item]) => {
            const textMatch = !searchTerm || (
                item.Brand?.toLowerCase().includes(searchTerm) ||
                item.Model?.toLowerCase().includes(searchTerm) ||
                item.Color?.toLowerCase().includes(searchTerm) ||
                item.Size?.toString().toLowerCase().includes(searchTerm)
            );
            const brandMatch = !brandFilter || item.Brand === brandFilter;
            const modelMatch = !modelFilter || item.Model === modelFilter;
            const colorMatch = !colorFilter || item.Color === colorFilter;
            const sizeMatch = !sizeFilter || item.Size === sizeFilter;

            if (textMatch && brandMatch && modelMatch && colorMatch && sizeMatch) {
                acc[loc] = item;
            }
            return acc;
        }, {});
    }

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
    
    const matchingSlots = new Set(Object.keys(filteredData));
    const matchingRacks = new Set(Array.from(matchingSlots).map(loc => loc.split('-')[0]));
    
    if (appState.currentView === 'grid') {
        container.className = 'rack-grid';
        renderGridView(container, totalRacks, isFiltering, matchingSlots, matchingRacks);
    } else {
        container.className = 'detail-layout';
        renderDetailView(container, totalRacks, isFiltering, matchingSlots, matchingRacks);
    }
    renderLegend();
}

export function renderGridView(container, totalRacks, isFiltering, matchingSlots, matchingRacks) {
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
        rackEl.innerHTML = `<div class="rack-title" data-rack-id="${rackId}" data-action="select-rack-title">Rack ${rackId}<span class="font-normal text-indigo-300 ml-2">- ${brandLabel}</span></div>`;
        
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
    else if (!isFiltering && racksFound === 0) container.innerHTML = `<p class="text-gray-500 text-center col-span-full">No items have been slotted for this site yet.</p>`;
}

export function renderDetailView(container, totalRacks, isFiltering, matchingSlots, matchingRacks) {
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
        rackButton.dataset.action = 'select-rack';
        const mainBrand = brandsInRack[0];
        rackButton.innerHTML = `<div class="rack-label" style="color: ${textColor}">${rackId}</div><div class="brand-label" style="color: ${brandColor}">${mainBrand || (isExcluded ? 'EXCLUDED' : 'Empty')}</div>`;
        
        if (isExcluded) {
            rackButton.removeAttribute('data-action');
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
                    slotEl.dataset.locationId = locationId;
                    
                    const item = appState.finalSlottedData[locationId];
                    if (item) {
                        const colorInfo = appState.colorMap[item.Sex] || appState.colorMap['M'];
                        const color = item.Type === 'PO' ? colorInfo.po : colorInfo.onHand;
                        slotEl.style.backgroundColor = color;
                        slotEl.innerHTML = `<div class="font-semibold text-xs italic">${item.Model}</div><div class="text-xs">${item.Color}, Sz ${item.Size}</div>`;
                        slotEl.setAttribute('draggable', 'true');
                        
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

export function renderLegend() {
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

export function renderMetricsPanel(newlySlottedCount) {
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
    if(newlySlottedCount !== undefined) getEl('items-newly-slotted').textContent = newlySlottedCount;
    const capacityBar = getEl('capacity-bar');
    capacityBar.style.width = `${capacity}%`;
    capacityBar.textContent = `${capacity.toFixed(1)}%`;
    renderBrandChart();
}

export function renderBrandChart() {
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


// --- Component-Specific Rendering ---

export function renderExclusionList() {
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
            <button data-keyword="${keyword}" data-action="remove-exclusion" class="remove-exclusion-btn text-red-500 hover:text-red-700 font-bold">&times;</button>
        `;
        container.appendChild(el);
    });
}

export function renderCushionUI() {
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
        removeBtn.dataset.action = 'remove-cushion-level';
        removeBtn.dataset.level = level;
        
        item.appendChild(leftSide);
        item.appendChild(removeBtn);
        list.appendChild(item);
    });

    updateModelAssignmentList();
}

export function updateModelAssignmentList() {
    const container = getEl('model-assignment-list');
    container.innerHTML = '';
    
    const uniqueModels = appState.allKnownModels.sort();

    if (uniqueModels.length === 0) {
        container.innerHTML = '<p class="text-gray-500">No models loaded. Upload an inventory file to begin.</p>';
        return;
    }

    uniqueModels.forEach(model => {
        const el = document.createElement('div');
        el.className = 'flex justify-between items-center';
        
        const label = document.createElement('label');
        label.className = 'font-medium text-gray-700';
        label.textContent = model;
        
        const select = document.createElement('select');
        select.className = 'border-gray-300 rounded-md shadow-sm w-48 model-assignment-select';
        select.dataset.model = model;
        select.dataset.action = 'assign-cushion';
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

        el.appendChild(label);
        el.appendChild(select);
        container.appendChild(el);
    });
}

export function renderSiteManagementModal() {
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
            <button data-site-id="${site.id}" data-site-name="${site.name}" data-action="delete-site" class="delete-site-btn text-red-500 hover:text-red-700 font-bold text-lg">&times;</button>
        `;
        container.appendChild(el);
    });
}

export function renderUserManagementModal() {
    const pendingContainer = getEl('pending-approvals-container');
    const activeContainer = getEl('user-list-container');
    pendingContainer.innerHTML = '<div class="spinner"></div>';
    activeContainer.innerHTML = '';

    const usersCollectionRef = collection(db, 'users');
    getDocs(usersCollectionRef).then(usersSnapshot => {
        pendingContainer.innerHTML = '';
        
        const pendingUsers = [];
        const activeUsers = [];

        usersSnapshot.docs.forEach(doc => {
            const user = { id: doc.id, ...doc.data() };
            if (user.status === 'pending') {
                pendingUsers.push(user);
            } else if (user.status !== 'denied') {
                activeUsers.push(user);
            }
        });

        if (pendingUsers.length === 0) {
            pendingContainer.innerHTML = '<p class="text-gray-500">No new users are awaiting approval.</p>';
        } else {
            pendingUsers.forEach(user => {
                const userEl = document.createElement('div');
                userEl.className = 'flex justify-between items-center p-3 rounded-lg bg-yellow-50 border border-yellow-200';
                const requestDate = user.requestTimestamp?.toDate().toLocaleDateString() || 'N/A';
                userEl.innerHTML = `
                    <div>
                        <p class="font-semibold">${user.email}</p>
                        <p class="text-xs text-gray-600">Requested: ${requestDate}</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button data-uid="${user.id}" data-action="approve-user" class="btn btn-primary bg-green-600 hover:bg-green-700 text-xs py-1 px-2">Approve</button>
                        <button data-uid="${user.id}" data-action="deny-user" class="btn btn-secondary bg-red-600 hover:bg-red-700 text-white text-xs py-1 px-2">Deny</button>
                    </div>
                `;
                pendingContainer.appendChild(userEl);
            });
        }

        if (activeUsers.length === 0) {
            activeContainer.innerHTML = '<p class="text-gray-500">No other active users found.</p>';
        } else {
            activeUsers.forEach(user => {
                const userEl = document.createElement('div');
                userEl.className = 'flex justify-between items-center p-3 rounded-lg bg-gray-50 border';
                
                const emailSpan = `<span class="font-semibold">${user.email}</span>`;
                const selfLabel = user.id === appState.currentUser.uid ? '<span class="text-xs font-bold text-indigo-600 ml-2">(You)</span>' : '';
                
                const roleSelect = `
                    <select data-uid="${user.id}" data-action="update-role" class="role-select border-gray-300 rounded-md shadow-sm" ${user.id === appState.currentUser.uid ? 'disabled' : ''}>
                        <option value="salesfloor" ${user.role === 'salesfloor' ? 'selected' : ''}>Salesfloor</option>
                        <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>Manager</option>
                    </select>
                `;
                
                const deleteBtn = `<button data-uid="${user.id}" data-email="${user.email}" data-action="delete-user" class="delete-user-btn text-red-500 hover:text-red-700 disabled:opacity-50" ${user.id === appState.currentUser.uid ? 'disabled' : ''}>&times;</button>`;
                
                userEl.innerHTML = `
                    <div>${emailSpan} ${selfLabel}</div>
                    <div class="flex items-center gap-4">${roleSelect} ${deleteBtn}</div>
                `;
                activeContainer.appendChild(userEl);
            });
        }
    }).catch(error => {
        console.error("Error fetching users:", error);
        pendingContainer.innerHTML = '<p class="text-red-500">Could not load user list.</p>';
    });
}

export function adjustUiForRole(role) {
    const isManager = role === 'manager';
    
    document.querySelectorAll('.manager-only').forEach(el => {
        el.classList.toggle('hidden', !isManager);
    });
    
    updateUiForSiteSelection();
}

export function updateUiForSiteSelection() {
    const hasSite = !!appState.selectedSiteId;
    document.querySelectorAll('.file-input-btn, #slotBtn').forEach(el => {
        if (el.disabled !== undefined) {
            el.disabled = !hasSite;
        }
    });
    checkFiles();
}

function getCushionIndicatorColor(levelIndex) {
    const baseColor = appState.cushionIndicatorColor;
    const totalLevels = appState.cushionLevels.length;
    
    if (totalLevels === 0 || levelIndex === -1) {
        return 'transparent';
    }

    const opacity = 1.0 - (levelIndex / (totalLevels -1 || 1)) * 0.9;

    let r = 0, g = 0, b = 0;
    if (baseColor.length === 7) {
        r = parseInt(baseColor.substring(1, 3), 16);
        g = parseInt(baseColor.substring(3, 5), 16);
        b = parseInt(baseColor.substring(5, 7), 16);
    }
    
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function renderSiteSelector() {
    const selector = getEl('site-selector');
    selector.innerHTML = '';
    appState.sites.forEach(site => {
        const option = document.createElement('option');
        option.value = site.id;
        option.textContent = site.name;
        selector.appendChild(option);
    });
}

export function updateFilterDropdowns() {
    const brandFilter = getEl('brand-filter');
    const modelFilter = getEl('model-filter');
    const colorFilter = getEl('color-filter');
    const sizeFilter = getEl('size-filter');

    const selectedBrand = brandFilter.value;
    const selectedModel = modelFilter.value;
    const selectedColor = colorFilter.value;

    // Preserve current selections
    const lastSelected = {
        brand: selectedBrand,
        model: selectedModel,
        color: selectedColor,
        size: sizeFilter.value
    };

    // Filter available items based on selections so far
    let availableItems = Object.values(appState.finalSlottedData);
    if (selectedBrand) availableItems = availableItems.filter(item => item.Brand === selectedBrand);
    if (selectedModel) availableItems = availableItems.filter(item => item.Model === selectedModel);
    if (selectedColor) availableItems = availableItems.filter(item => item.Color === selectedColor);

    // Populate Brands
    populateDropdown(brandFilter, 'All Brands', [...new Set(Object.values(appState.finalSlottedData).map(item => item.Brand))].sort(), lastSelected.brand);

    // Populate Models (based on selected brand)
    let availableModels = [...new Set(Object.values(appState.finalSlottedData).filter(item => !selectedBrand || item.Brand === selectedBrand).map(item => item.Model))].sort();
    populateDropdown(modelFilter, 'All Models', availableModels, lastSelected.model);
    modelFilter.disabled = !selectedBrand;

    // Populate Colors (based on brand and model)
    let availableColors = [...new Set(Object.values(appState.finalSlottedData).filter(item => (!selectedBrand || item.Brand === selectedBrand) && (!selectedModel || item.Model === selectedModel)).map(item => item.Color))].sort();
    populateDropdown(colorFilter, 'All Colors', availableColors, lastSelected.color);
    colorFilter.disabled = !selectedModel;

    // Populate Sizes (based on brand, model, and color)
    let availableSizes = [...new Set(availableItems.map(item => item.Size))].sort((a, b) => parseFloat(a) - parseFloat(b));
    populateDropdown(sizeFilter, 'All Sizes', availableSizes, lastSelected.size);
    sizeFilter.disabled = !selectedColor;
}

function populateDropdown(selectElement, defaultOptionText, options, selectedValue) {
    selectElement.innerHTML = `<option value="">${defaultOptionText}</option>`;
    options.forEach(optionValue => {
        if(optionValue) {
            const option = document.createElement('option');
            option.value = optionValue;
            option.textContent = optionValue;
            if (optionValue === selectedValue) {
                option.selected = true;
            }
            selectElement.appendChild(option);
        }
    });
}

export function checkFiles() {
    const inventoryFiles = appState.rawInventoryFiles;
    const poFiles = appState.rawPOFiles;
    const slotBtn = getEl('slotBtn');

    if (appState.selectedSiteId && (inventoryFiles.length > 0 || poFiles.length > 0)) {
        slotBtn.disabled = false;
        getEl('downloadPdfBtn').disabled = false;
        getEl('downloadCsvBtn').disabled = false;
        getEl('viewToggleBtn').disabled = false;
    } else {
        slotBtn.disabled = true;
        getEl('downloadPdfBtn').disabled = true;
        getEl('downloadCsvBtn').disabled = true;
        getEl('viewToggleBtn').disabled = true;
    }
}

export function renderPODetails() {
    const container = getEl('po-list-container');
    const summary = getEl('po-summary');
    container.innerHTML = '';

    const allPOs = Object.entries(appState.loadedPOs);

    if (allPOs.length === 0) {
        summary.textContent = '';
        container.innerHTML = '<p class="text-gray-500">No POs loaded or all have been fully received.</p>';
        return;
    }

    let totalItems = 0;
    let totalValue = 0; // Assuming value could be added later

    allPOs.forEach(([, po]) => {
        totalItems += po.itemCount;
    });

    summary.textContent = `Displaying ${allPOs.length} PO(s) with a total of ${totalItems} unreceived items.`;

    allPOs.forEach(([key, po]) => {
        const el = document.createElement('div');
        el.className = 'p-3 rounded-lg bg-gray-50 border flex justify-between items-center';
        el.innerHTML = `
            <div>
                <p class="font-semibold text-indigo-700">${po.brand} - <span class="font-normal text-gray-600">${key}</span></p>
                <p class="text-sm text-gray-500">${po.itemCount} items | Loaded: ${po.loadedDate}</p>
            </div>
            <button data-po-key="${key}" data-action="receive-po" class="btn btn-primary text-sm py-1 px-3">Mark as Received</button>
        `;
        container.appendChild(el);
    });
}

export function renderUnslottedReport() {
    const container = getEl('unslotted-list-container');
    const badge = getEl('unslotted-badge');
    const downloadBtn = getEl('downloadUnslottedBtn');
    container.innerHTML = '';

    if (appState.unslottedItems.length === 0) {
        badge.classList.add('hidden');
        downloadBtn.disabled = true;
        container.innerHTML = '<p class="text-gray-500">Run the slotting process to see unslotted items.</p>';
        return;
    }

    badge.textContent = appState.unslottedItems.length;
    badge.classList.remove('hidden');
    downloadBtn.disabled = false;

    const itemsByBrand = appState.unslottedItems.reduce((acc, item) => {
        if (!acc[item.Brand]) {
            acc[item.Brand] = [];
        }
        acc[item.Brand].push(item);
        return acc;
    }, {});

    Object.entries(itemsByBrand).forEach(([brand, items]) => {
        const brandHeader = document.createElement('h3');
        brandHeader.className = 'text-md font-semibold text-gray-700 mt-4 -mb-2';
        brandHeader.textContent = brand;
        container.appendChild(brandHeader);

        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'p-2 rounded-md bg-red-50 border border-red-100';
            el.innerHTML = `<p class="font-medium text-red-800">${item.Model} - ${item.Color} - ${item.Size}</p>
                            <p class="text-xs text-red-600">${item.OriginalItemString}</p>`;
            container.appendChild(el);
        });
    });
}

export function toggleView() {
    appState.currentView = appState.currentView === 'grid' ? 'detail' : 'grid';
    getEl('viewToggleBtn').textContent = appState.currentView === 'grid' ? 'Detail View' : 'Grid View';
    renderUI();
}
