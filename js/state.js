/**
 * @file state.js
 * @description Defines and exports the global application state object.
 * This centralized state management makes it easier to track and modify
 * the application's data from a single source of truth.
 */

export const appState = {
    // Site and User Data
    sites: [],
    selectedSiteId: null,
    currentUser: {
        uid: null,
        email: null,
        role: null, // 'manager' or 'salesfloor'
        homeSiteId: null
    },
    userInitials: '',

    // Core Slotting Data
    finalSlottedData: {},
    unslottedItems: [],
    loadedPOs: {},
    
    // MODIFIED: Store raw file objects to avoid re-reading from DOM
    rawInventoryFiles: [],
    rawPOFiles: [],

    // Configuration
    exclusionKeywords: [],
    cushionLevels: [],
    modelCushionAssignments: {},
    allKnownModels: [], // To store all unique models for cushioning
    
    // UI State
    currentView: 'grid',
    selectedRackId: 1,
    brandChart: null,
    colorMap: {
        'M': { name: 'Men', onHand: '#5468C1', po: '#a9b3e0' },
        'W': { name: 'Women', onHand: '#f846f0', po: '#fbc2f8' },
        'K': { name: 'Kids', onHand: '#64d669', po: '#b1ebc4' },
        'Y': { name: 'Kids', onHand: '#64d669', po: '#b1ebc4' }
    },
    cushionIndicatorColor: '#6b7280'
};
