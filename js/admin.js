// js/admin.js
// This file contains all logic specific to the Admin Panel.

import { addDoc, getDocs, deleteDoc, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let _db;
let _auth;
let _appId;
let _currentUserId;
let _serverTimestamp;
let _Papa;
let _showConfirmModal; // Function to show the custom confirmation modal
let _collection;
let _query;
let _where;
let _addDoc;
let _getDocs;
let _doc;
let _updateDoc;
let _deleteDoc;

let definitionCounter = 0; // Tracks the number of definition blocks in the form
let termsCollectionRef; // Reference to the Firestore terms collection

// Define expected and alternative column headers as indicators for flexible parsing.
const COLUMN_MAPPINGS = {
    'term_indicators': ['term', 'concept', 'word', 'name'],
    'note_indicators': ['note', 'description', 'summary', 'notes'], // Added 'notes'
    'definition_indicators': ['definition', 'meaning', 'def', 'deff', 'explanation'], // Matches 'def' from user's CSV
    'tag_indicators': ['tags', 'keywords', 'categories', 'tag', 'tabs'] // Added 'tabs'
};

/**
 * Initializes the Admin module with Firebase instances, user details, and external libraries.
 * @param {object} db - Firestore database instance.
 * @param {object} auth - Firebase Auth instance.
 * @param {string} appId - The application ID.
 * @param {string} currentUserId - The current authenticated user's ID.
 * @param {function} serverTimestamp - Firebase serverTimestamp function.
 * @param {object} Papa - Papa Parse library instance.
 * @param {function} showConfirmModal - Function to display the custom confirmation modal.
 * @param {function} collectionFn - The Firestore 'collection' function.
 * @param {function} queryFn - The Firestore 'query' function.
 * @param {function} whereFn - The Firestore 'where' function.
 * @param {function} addDocFn - The Firestore 'addDoc' function.
 * @param {function} getDocsFn - The Firestore 'getDocs' function.
 * @param {function} docFn - The Firestore 'doc' function.
 * @param {function} updateDocFn - The Firestore 'updateDoc' function.
 * @param {function} deleteDocFn - The Firestore 'deleteDoc' function.
 */
export function initAdmin(db, auth, appId, currentUserId, serverTimestamp, Papa, showConfirmModal, collectionFn, queryFn, whereFn, addDocFn, getDocsFn, docFn, updateDocFn, deleteDocFn) {
    _db = db;
    _auth = auth;
    _appId = appId;
    _currentUserId = currentUserId;
    _serverTimestamp = serverTimestamp;
    _Papa = Papa;
    _showConfirmModal = showConfirmModal;
    _collection = collectionFn;
    _query = queryFn;
    _where = whereFn;
    _addDoc = addDocFn;
    _getDocs = getDocsFn;
    _doc = docFn;
    _updateDoc = updateDocFn;
    _deleteDoc = deleteDocFn;

    termsCollectionRef = _collection(_db, `artifacts/${_appId}/public/data/terms`);

    console.log("Admin module initialized. App ID:", _appId);

    // UI elements specific to Admin panel - ensure they are present after innerHTML update in index.html
    const addDefinitionBtn = document.getElementById('add-definition-btn');
    const termForm = document.getElementById('term-form');
    const saveTermBtn = document.getElementById('save-term-btn');
    const refreshTermsBtn = document.getElementById('refresh-terms-btn');
    const csvFileInput = document.getElementById('csv-file-input');
    const importCsvBtn = document.getElementById('import-csv-btn');
    const clearDatabaseBtn = document.getElementById('clear-database-btn');

    // Attach event listeners
    if (addDefinitionBtn) addDefinitionBtn.addEventListener('click', addDefinitionBlock);
    if (termForm) termForm.addEventListener('submit', handleSaveTerm);
    if (refreshTermsBtn) refreshTermsBtn.addEventListener('click', displayTermsMatrix);
    if (importCsvBtn) importCsvBtn.addEventListener('click', handleImportCsv);
    if (clearDatabaseBtn) clearDatabaseBtn.addEventListener('click', handleClearDatabase);

    // Add an initial definition block when the admin panel loads
    addDefinitionBlock();

    // Set initial state of save button based on authentication
    if (saveTermBtn) {
        saveTermBtn.disabled = !(_auth.currentUser && _auth.currentUser.uid);
    }

    // Display existing terms on load
    displayTermsMatrix();
}

/**
 * Displays existing terms from Firestore in a scrollable matrix (table).
 */
async function displayTermsMatrix() {
    const termsMatrixBody = document.getElementById('terms-matrix-body');
    if (!termsMatrixBody) return;

    termsMatrixBody.innerHTML = '<tr><td colspan="3" class="text-center py-4">Loading terms...</td></tr>';

    try {
        const snapshot = await _getDocs(termsCollectionRef);
        if (snapshot.empty) {
            termsMatrixBody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-gray-400">No terms found in the database.</td></tr>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const termData = doc.data();
            html += `
                <tr class="bg-gray-800 border-b border-gray-700 hover:bg-gray-600">
                    <th scope="row" class="py-3 px-6 font-medium text-white whitespace-nowrap">${termData.term}</th>
                    <td class="py-3 px-6 text-center">${termData.indexDefs || 0}</td>
                    <td class="py-3 px-6 text-center">${termData.indexTags || 0}</td>
                </tr>
            `;
        });
        termsMatrixBody.innerHTML = html;
    }
    catch (error) {
        console.error("Error fetching terms for matrix:", error);
        termsMatrixBody.innerHTML = `<tr><td colspan="3" class="text-center py-4 text-red-400">Error loading terms: ${error.message}</td></tr>`;
    }
}

/**
 * Adds a new definition block to the form for single term entry.
 */
function addDefinitionBlock() {
    definitionCounter++;
    const definitionsContainer = document.getElementById('definitions-container');
    if (!definitionsContainer) return;

    const block = document.createElement('div');
    block.className = 'definition-block bg-gray-700 p-4 rounded-lg border border-gray-600';
    block.innerHTML = `
        <label class="block text-sm font-medium text-gray-300 mb-1">Definition ${definitionCounter}</label>
        <textarea required class="definition-text w-full bg-gray-600 border border-gray-500 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-cyan-500" rows="3" placeholder="Explain the term..."></textarea>
        <label class="block text-sm font-medium text-gray-300 mt-2 mb-1">Tags (comma-separated, e.g., color:red, type:process, origin:manual)</label>
        <input type="text" class="definition-tags w-full bg-gray-600 border border-gray-500 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-cyan-500" placeholder="e.g., biology:core, color:green">
    `;
    definitionsContainer.appendChild(block);
}

/**
 * Handles the saving of a single term to Firestore.
 * It will either add a new term or merge with an existing one.
 * @param {Event} event - The form submission event.
 */
async function handleSaveTerm(event) {
    event.preventDefault();

    const saveTermBtn = document.getElementById('save-term-btn');
    const saveBtnText = document.getElementById('save-btn-text');
    const saveSpinner = document.getElementById('save-spinner');
    const statusMessage = document.getElementById('status-message');

    // Show loading state
    saveTermBtn.disabled = true;
    saveBtnText.textContent = 'Saving...';
    saveSpinner.classList.remove('hidden');
    statusMessage.textContent = '';
    statusMessage.classList.remove('text-red-500', 'text-green-500');
    statusMessage.classList.add('text-yellow-400');

    try {
        const termInput = document.getElementById('term');
        const noteInput = document.getElementById('note');
        const definitionTexts = document.querySelectorAll('.definition-text');
        const definitionTags = document.querySelectorAll('.definition-tags');

        const termName = termInput ? termInput.value.trim() : '';
        const note = noteInput ? noteInput.value.trim() : '';

        if (!termName) {
            statusMessage.textContent = 'Error: Term name is required.';
            statusMessage.classList.replace('text-yellow-400', 'text-red-500');
            return;
        }
        if (definitionTexts.length === 0 || Array.from(definitionTexts).every(input => !input.value.trim())) {
            statusMessage.textContent = 'Error: At least one definition is required.';
            statusMessage.classList.replace('text-yellow-400', 'text-red-500');
            return;
        }

        const incomingDefinitions = [];
        definitionTexts.forEach((textInput, index) => {
            const definitionText = textInput.value.trim();
            const tagsInput = definitionTags[index] ? definitionTags[index].value.trim() : '';
            const tagsArray = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag !== '');

            if (definitionText) {
                incomingDefinitions.push({
                    text: definitionText,
                    tags: tagsArray,
                    origin: 'manual', // Default origin for manual entry
                    // Using client-side timestamp for definitions within array
                    createdAt: new Date().toISOString(),
                    modified: new Date().toISOString()
                });
            }
        });

        if (incomingDefinitions.length === 0) {
            statusMessage.textContent = 'Error: No valid definitions found. Please fill in at least one.';
            statusMessage.classList.replace('text-yellow-400', 'text-red-500');
            return;
        }

        // Check if term already exists
        const q = _query(termsCollectionRef, _where('term', '==', termName));
        const querySnapshot = await _getDocs(q);

        let termId = null;
        let existingTermData = null;

        if (!querySnapshot.empty) {
            termId = querySnapshot.docs[0].id;
            existingTermData = querySnapshot.docs[0].data();
        }

        let definitionsToSave = existingTermData ? [...existingTermData.definitions] : [];
        let definitionsAddedCount = 0;
        let definitionsUpdatedCount = 0;

        incomingDefinitions.forEach(newDef => {
            const existingDefIndex = definitionsToSave.findIndex(def => def.text === newDef.text);

            if (existingDefIndex !== -1) {
                // Definition exists, check if tags need merging/updating
                const existingDef = definitionsToSave[existingDefIndex];
                const mergedTags = Array.from(new Set([...(existingDef.tags || []), ...newDef.tags])); // Merge tags, remove duplicates

                if (existingDef.tags.length !== mergedTags.length || !existingDef.tags.every(tag => mergedTags.includes(tag))) {
                    // Tags have changed or new tags added
                    definitionsToSave[existingDefIndex] = {
                        ...existingDef,
                        tags: mergedTags,
                        modified: new Date().toISOString() // Client-side timestamp for definition update
                    };
                    definitionsUpdatedCount++;
                }
            } else {
                // New definition
                definitionsToSave.push({
                    ...newDef,
                    createdAt: new Date().toISOString(), // Client-side timestamp for new definition
                    modified: new Date().toISOString() // Also add modified for new definitions
                });
                definitionsAddedCount++;
            }
        });

        const totalIndexDefs = definitionsToSave.length;
        // CORRECTED: Calculate unique tags across all definitions for the term
        const allUniqueTags = new Set();
        definitionsToSave.forEach(def => {
            if (def.tags) {
                def.tags.forEach(tag => allUniqueTags.add(tag));
            }
        });
        const totalIndexTags = allUniqueTags.size;


        const termDataToSave = {
            term: termName,
            note: note,
            indexDefs: totalIndexDefs,
            indexTags: totalIndexTags, // Now correctly counts unique tags
            definitions: definitionsToSave,
            updatedAt: _serverTimestamp(), // Top-level term update timestamp
            // createdBy and createdAt are set only for truly new terms
            ...(termId ? {} : { createdBy: _currentUserId, createdAt: _serverTimestamp() }) // Top-level term creation timestamp
        };

        if (termId) {
            // Update existing term
            await _updateDoc(_doc(_db, `artifacts/${_appId}/public/data/terms`, termId), termDataToSave);
            statusMessage.textContent = `Term "${termName}" updated successfully! Added ${definitionsAddedCount} new definitions, updated ${definitionsUpdatedCount} definitions.`;
        } else {
            // Add new term
            await _addDoc(termsCollectionRef, dataToSave);
            statusMessage.textContent = `Term "${termName}" added successfully!`;
        }

        statusMessage.classList.replace('text-yellow-400', 'text-green-500');

        // Clear the form after successful save
        termInput.value = '';
        if (noteInput) noteInput.value = '';
        document.getElementById('definitions-container').innerHTML = '';
        definitionCounter = 0;
        addDefinitionBlock(); // Add back one empty definition block
        displayTermsMatrix(); // Refresh the displayed terms

    } catch (error) {
        console.error("Error saving term:", error);
        statusMessage.textContent = `Error saving term: ${error.message}`;
        statusMessage.classList.replace('text-yellow-400', 'text-red-500');
    } finally {
        // Reset loading state
        saveTermBtn.disabled = false;
        saveBtnText.textContent = 'Save Term';
        saveSpinner.classList.add('hidden');
    }
}

/**
 * Attempts to intelligently map a raw CSV row (array of values) to a rehashed object
 * based on identified headers and COLUMN_MAPPINGS.
 * @param {Array<string>} rowValues - An array of values from a single CSV row.
 * @param {Array<string>} headers - The array of header names from the first row of the CSV.
 * @returns {object|null} - A rehashed row object with standard keys (term, note, definitionTexts, allTags),
 * or null if essential data (term or definition) is missing.
 */
function rehashCsvRow(rowValues, headers) {
    const rehashedRow = {
        term: '',
        note: '',
        definitionTexts: [], // To collect all definition values from definition-like columns
        allTags: new Set()   // To collect all unique tags from tag-like columns
    };
    let termFound = false;
    let definitionFound = false; // To ensure at least one definition is found

    headers.forEach((header, index) => {
        const lowerHeader = String(header || '').toLowerCase();
        const value = String(rowValues[index] || '').trim();

        // Check for Term
        if (!termFound && COLUMN_MAPPINGS.term_indicators.some(indicator => lowerHeader === indicator)) {
            rehashedRow.term = value;
            if (value !== '') termFound = true;
        }
        // Check for Note
        else if (COLUMN_MAPPINGS.note_indicators.some(indicator => lowerHeader === indicator)) {
            rehashedRow.note = value;
        }
        // Check for Definitions
        // Use .includes to match 'def' within 'def1', 'def2' etc.
        else if (COLUMN_MAPPINGS.definition_indicators.some(indicator => lowerHeader.includes(indicator))) {
            if (value !== '') {
                rehashedRow.definitionTexts.push(value);
                definitionFound = true; // At least one definition text found
            }
        }
        // Check for Tags
        // Use .includes to match 'tag' within 'tag1', 'tag2' etc.
        else if (COLUMN_MAPPINGS.tag_indicators.some(indicator => lowerHeader.includes(indicator))) {
            if (value !== '') {
                value.split(',').forEach(tag => {
                    const trimmedTag = tag.trim();
                    if (trimmedTag) {
                        rehashedRow.allTags.add(trimmedTag);
                    }
                });
            }
        }
    });

    // Final validation: A term and at least one definition text are required
    if (!termFound || rehashedRow.term === '' || !definitionFound || rehashedRow.definitionTexts.length === 0) {
        return null; // This row cannot be meaningfully rehashed or is incomplete
    }

    // Convert Set of tags to an Array
    rehashedRow.allTags = Array.from(rehashedRow.allTags);

    return rehashedRow;
}


/**
 * Handles CSV file import, parsing data and merging it into the database.
 * Includes rehash logic for column mapping.
 * @param {File} file - The CSV file to import.
 * @param {string} fileName - The name of the imported file.
 * @param {HTMLElement} importStatusMessage - The element to display import status.
 * @param {HTMLInputElement} csvFileInputElement - The file input element to clear after import.
 */
async function processCsvFile(file, fileName, importStatusMessage, csvFileInputElement) {
    importStatusMessage.textContent = `Importing "${fileName}"... (Parsing)`;
    importStatusMessage.classList.remove('text-red-500', 'text-green-500');
    importStatusMessage.classList.add('text-yellow-400');

    let rawParsedData; // Renamed to clarify it's the raw array-of-arrays from PapaParse
    try {
        console.log(`Attempting to parse CSV file: ${fileName}`);
        rawParsedData = await new Promise((resolve, reject) => {
            _Papa.parse(file, {
                header: false, // CRITICAL CHANGE: Parse as array of arrays, not objects
                skipEmptyLines: true,
                dynamicTyping: true, // Attempt to convert numbers/booleans
                complete: function(results) {
                    console.log("PapaParse complete results (header: false):", results);
                    if (results.errors.length) {
                        reject(new Error(`CSV parsing errors: ${results.errors.map(e => e.message).join('; ')}`));
                    } else {
                        resolve(results.data);
                    }
                },
                error: function(err) {
                    console.error("PapaParse error:", err);
                    reject(err);
                }
            });
        });

        console.log("Raw Parsed Data (array of arrays):", rawParsedData);

        if (!rawParsedData || rawParsedData.length < 2) { // Need at least 2 rows: headers + 1 data row
            importStatusMessage.textContent = 'CSV file is empty or missing headers/data.';
            importStatusMessage.classList.replace('text-yellow-400', 'text-red-500');
            return;
        }

        const actualHeaders = rawParsedData[0]; // First row is headers
        const dataRows = rawParsedData.slice(1); // Rest are data rows
        console.log("Actual CSV Headers (from first row):", actualHeaders);

        const rehashedAndValidatedData = [];
        let rowsSkippedDueToRehash = 0;
        dataRows.forEach((rowValues, index) => { // Iterate over array of values for each row
            const rehashedRow = rehashCsvRow(rowValues, actualHeaders);
            if (rehashedRow) {
                rehashedAndValidatedData.push(rehashedRow);
            } else {
                rowsSkippedDueToRehash++;
                console.warn(`Skipped row ${index + 2} (original CSV row number) due to insufficient data or unmappable columns after rehash:`, rowValues);
            }
        });

        console.log("Rehashed and Validated Data (ready for grouping):", rehashedAndValidatedData);
        if (rehashedAndValidatedData.length === 0) {
             importStatusMessage.textContent = `No valid terms found in the CSV file after rehash. ${rowsSkippedDueToRehash} rows skipped.`;
             importStatusMessage.classList.replace('text-yellow-400', 'text-red-500');
             return;
        }


        importStatusMessage.textContent = `Processing ${rehashedAndValidatedData.length} valid rows from "${fileName}"...`;

        // Group data by term, assuming a single row can provide multiple definitions for one term
        const termsToProcess = {};
        rehashedAndValidatedData.forEach(row => {
            const termName = row.term; // Use the rehashed 'term' key
            if (!termsToProcess[termName]) {
                termsToProcess[termName] = {
                    term: termName,
                    note: row.note, // Use rehashed 'note' key
                    definitions: [] // This will store the final definition objects
                };
            }

            // For each definition text found in the row, create a definition object
            row.definitionTexts.forEach(defText => {
                termsToProcess[termName].definitions.push({
                    text: defText,
                    tags: row.allTags, // Apply all tags collected from the row to each definition
                    origin: fileName // Origin from the imported file
                });
            });
        });

        console.log("Terms grouped for processing (before Firestore merge):", termsToProcess);
        if (Object.keys(termsToProcess).length === 0) {
            importStatusMessage.textContent = 'No valid terms found in the CSV file after grouping parsed data.';
            importStatusMessage.classList.replace('text-yellow-400', 'text-red-500');
            return;
        }

        let termsAdded = 0;
        let termsUpdated = 0;
        let definitionsSkipped = 0;
        let definitionsAdded = 0;
        let definitionsUpdated = 0;
        let totalTermsInCsv = Object.keys(termsToProcess).length;
        let termsProcessedCount = 0;

        for (const termName in termsToProcess) {
            termsProcessedCount++;
            importStatusMessage.textContent = `Processing term ${termsProcessedCount} of ${totalTermsInCsv}: "${termName}"...`;
            const incomingTermData = termsToProcess[termName];

            // Check if term already exists in Firestore
            const q = _query(termsCollectionRef, _where('term', '==', termName));
            const querySnapshot = await _getDocs(q);

            let termDocId = null;
            let existingTermFirestoreData = null;

            if (!querySnapshot.empty) {
                termDocId = querySnapshot.docs[0].id;
                existingTermFirestoreData = querySnapshot.docs[0].data();
            }

            let definitionsForFirestore = existingTermFirestoreData ? [...(existingTermFirestoreData.definitions || [])] : []; // Ensure definitions array exists
            let termWasUpdated = false;

            // Merge definitions
            incomingTermData.definitions.forEach(newDef => {
                const existingDefIndex = definitionsForFirestore.findIndex(def => def.text === newDef.text);

                if (existingDefIndex !== -1) {
                    // Definition text is a duplicate. Check and merge tags.
                    const existingDef = definitionsForFirestore[existingDefIndex];
                    // Ensure existingDef.tags is an array before spreading
                    const mergedTags = Array.from(new Set([...(existingDef.tags || []), ...newDef.tags]));

                    if (existingDef.tags.length !== mergedTags.length || !existingDef.tags.every(tag => mergedTags.includes(tag))) {
                        // Tags have changed or new tags added
                        definitionsForFirestore[existingDefIndex] = {
                            ...existingDef,
                            tags: mergedTags,
                            modified: new Date().toISOString() // Client-side timestamp for definition update
                        };
                        definitionsUpdated++;
                        termWasUpdated = true;
                    } else {
                        definitionsSkipped++; // Definition and tags are identical
                    }
                } else {
                    // New definition
                    definitionsForFirestore.push({
                        ...newDef,
                        createdAt: new Date().toISOString(), // Client-side timestamp for new definition
                        modified: new Date().toISOString() // Also add modified for new definitions
                    });
                    definitionsAdded++;
                    termWasUpdated = true;
                }
            });

            // Calculate updated indices
            const newIndexDefs = definitionsForFirestore.length;
            // CORRECTED: Calculate unique tags across all definitions for the term
            const allUniqueTagsForTerm = new Set();
            definitionsForFirestore.forEach(def => {
                if (def.tags) {
                    def.tags.forEach(tag => allUniqueTagsForTerm.add(tag));
                }
            });
            const newIndexTags = allUniqueTagsForTerm.size;

            const dataToSave = {
                term: incomingTermData.term,
                note: incomingTermData.note,
                indexDefs: newIndexDefs,
                indexTags: newIndexTags, // Now correctly counts unique tags
                definitions: definitionsForFirestore,
                updatedAt: _serverTimestamp()
            };

            if (termDocId) {
                // Update existing term document
                await _updateDoc(_doc(_db, `artifacts/${_appId}/public/data/terms`, termDocId), dataToSave);
                if (termWasUpdated) {
                    termsUpdated++;
                }
            } else {
                // Add new term document
                dataToSave.createdBy = _currentUserId;
                dataToSave.createdAt = _serverTimestamp();
                await _addDoc(termsCollectionRef, dataToSave);
                termsAdded++;
            }
        }

        importStatusMessage.textContent = `Import complete: ${termsAdded} terms added, ${termsUpdated} terms updated. ${definitionsAdded} new definitions added, ${definitionsUpdated} existing definitions updated, ${definitionsSkipped} definitions skipped. ${rowsSkippedDueToRehash} rows skipped due to rehash issues.`;
        importStatusMessage.classList.replace('text-yellow-400', 'text-green-500');
        displayTermsMatrix(); // Refresh the matrix
        // Clear the file input element's value
        if (csvFileInputElement) {
            csvFileInputElement.value = '';
        }

    } catch (error) {
        console.error("Error importing CSV:", error);
        importStatusMessage.textContent = `Error importing CSV: ${error.message}`;
        importStatusMessage.classList.replace('text-yellow-400', 'text-red-500');
    }
}

/**
 * Handles the 'Import CSV' button click.
 */
async function handleImportCsv() {
    const csvFileInput = document.getElementById('csv-file-input');
    const importStatusMessage = document.getElementById('import-status-message');
    if (!csvFileInput || !csvFileInput.files.length) {
        importStatusMessage.textContent = 'Please select a CSV file.';
        importStatusMessage.classList.remove('text-yellow-400', 'text-green-500');
        importStatusMessage.classList.add('text-red-500');
        return;
    }
    const file = csvFileInput.files[0];
    // Pass the csvFileInput element to processCsvFile so it can clear its value
    await processCsvFile(file, file.name, importStatusMessage, csvFileInput);
}


/**
 * Handles clearing all terms from the database with a confirmation step.
 */
async function handleClearDatabase() {
    const clearDatabaseBtn = document.getElementById('clear-database-btn');
    clearDatabaseBtn.disabled = true; // Disable button during operation
    const importStatusMessage = document.getElementById('import-status-message'); // Reuse for general status

    const isConfirmed = await _showConfirmModal(
        "Confirm Database Clear",
        "This action will permanently delete ALL terms from the database. Are you absolutely sure?"
    );

    if (!isConfirmed) {
        console.log("Database clear canceled.");
        clearDatabaseBtn.disabled = false; // Re-enable button
        importStatusMessage.textContent = 'Database clear cancelled.';
        importStatusMessage.classList.remove('text-red-500', 'text-green-500');
    importStatusMessage.classList.add('text-yellow-400');
        return;
    }

    importStatusMessage.textContent = 'Clearing database...';
    importStatusMessage.classList.remove('text-red-500', 'text-green-500');
    importStatusMessage.classList.add('text-yellow-400');

    try {
        const snapshot = await _getDocs(termsCollectionRef);
        if (snapshot.empty) {
            importStatusMessage.textContent = 'Database is already empty.';
            importStatusMessage.classList.replace('text-yellow-400', 'text-green-500');
            return;
        }

        const deletePromises = [];
        snapshot.forEach(docItem => {
            deletePromises.push(_deleteDoc(_doc(termsCollectionRef, docItem.id)));
        });

        await Promise.all(deletePromises);
        importStatusMessage.textContent = `Successfully cleared ${snapshot.size} terms from the database.`;
        importStatusMessage.classList.replace('text-yellow-400', 'text-green-500');
        displayTermsMatrix(); // Refresh the matrix to show it's empty

    } catch (error) {
        console.error("Error clearing database:", error);
        importStatusMessage.textContent = `Error importing CSV: ${error.message}`;
        importStatusMessage.classList.replace('text-yellow-400', 'text-red-500');
    } finally {
        clearDatabaseBtn.disabled = false; // Re-enable button
    }
}
