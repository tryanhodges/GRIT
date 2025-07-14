/**
 * @file state.js
 * @description Defines and exports the global application state object.
 * This centralized state management makes it easier to track and modify
 * the application's data from a single source of truth.
 */

export const appState = {
    sites: [],
    selectedSiteId: null,
    finalSlottedData: {},
    unslottedItems: [],
    loadedPOs: {},
    exclusionKeywords: [],
    cushionLevels: [],
    modelCushionAssignments: {},
    allKnownModels: [], // To store all unique models for cushioning
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
