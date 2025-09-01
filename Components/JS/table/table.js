/**
 * @param {string} containerId - The ID of the HTML element where the table will be rendered.
 * @param {Object} config - The configuration object for the table.
 * @param {string} [config.keyField] - The name of the property in your data objects that serves as a
 *   unique identifier. **This is required if `selectable` is true.**
 * @returns {Object} An API to interact with the table instance.
 */
export function createDynamicTable(containerId, config) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`[DynamicTable] Error: Container #${containerId} not found.`);
        return {};
    }

    // --- Configuration and State Management ---

    const defaultConfig = {
        data: [],
        columns: [],
        keyField: null, // The user MUST provide this for certain features
        serverSide: false,
        pagination: { enabled: false, pageSize: 10 },
        filtering: { enabled: false, debounceMs: 300 },
        selectable: false,
        resizable: false,
        bordered: false,
        striped: false,
        emptyMessage: "No data available",
        tableClass: "dynamic-table",
        logging: false,
        locale: {
            prev: "Previous",
            next: "Next",
            showing: "Showing",
            of: "of",
        },
    };

    const settings = {
        ...defaultConfig,
        ...config,
        pagination: { ...defaultConfig.pagination, ...config.pagination },
        filtering: { ...defaultConfig.filtering, ...config.filtering },
        locale: { ...defaultConfig.locale, ...config.locale },
    };

    if (settings.selectable && !settings.keyField) {
        console.error(`[DynamicTable] Error: 'keyField' must be configured when 'selectable' is true. This should be the name of a unique identifier property in your data objects (e.g., 'id', 'userName').`);
        container.innerHTML = `<p style="color: red;">Configuration Error: 'keyField' is missing.</p>`;
        return {};
    }

    const state = {
        data: [],
        totalCount: 0,
        totalPages: 1,
        currentPage: 1,
        filters: {},
        sorter: null,
        selectedRows: new Set(),
        columnWidths: {},
    };

    const elements = { wrapper: null, table: null, tbody: null, pagination: null };

    const logger = {
        log: (...args) => settings.logging && console.log(`[DynamicTable:${containerId}]`, ...args),
        warn: (...args) => settings.logging && console.warn(`[DynamicTable:${containerId}]`, ...args),
        error: (...args) => console.error(`[DynamicTable:${containerId}]`, ...args),
    };

    // --- Core Logic ---

    const debounce = (func, delay) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    };

    const sanitize = (str) => {
        const temp = document.createElement('div');
        temp.textContent = String(str ?? '');
        return temp.innerHTML;
    };

    const processClientData = () => {
        logger.log('Processing data...');
        let processedData = [...settings.data];

        const filterEntries = Object.entries(state.filters).filter(([, value]) => value);
        if (filterEntries.length > 0) {
            processedData = processedData.filter(item =>
                filterEntries.every(([column, value]) =>
                    (item[column] ?? '').toString().toLowerCase().includes(value.toString().toLowerCase())
                )
            );
        }

        if (state.sorter) {
            const { column, order } = state.sorter;
            const columnConfig = settings.columns.find(c => c.id === column);
            const isNumeric = columnConfig?.dataType === 'number';

            processedData.sort((a, b) => {
                const valA = a[column];
                const valB = b[column];

                if (isNumeric) {
                    const numA = parseFloat(valA);
                    const numB = parseFloat(valB);
                    if (!isNaN(numA) && !isNaN(numB)) {
                        return order === 'asc' ? numA - numB : numB - numA;
                    }
                }

                const strA = String(valA ?? '');
                const strB = String(valB ?? '');
                const comparison = strA.localeCompare(strB, undefined, { numeric: true });
                return order === 'asc' ? comparison : -comparison;
            });
        }

        state.totalCount = processedData.length;
        state.totalPages = settings.pagination.enabled ? Math.ceil(state.totalCount / settings.pagination.pageSize) : 1;
        if (state.currentPage > state.totalPages) state.currentPage = state.totalPages || 1;

        const start = (state.currentPage - 1) * settings.pagination.pageSize;
        state.data = settings.pagination.enabled ? processedData.slice(start, start + settings.pagination.pageSize) : processedData;
    };

    const fetchData = async () => {
        if (!settings.serverSide) {
            processClientData();
        } else {
            logger.warn('Server-side processing is not implemented.');
            state.data = [];
            state.totalCount = 0;
        }
    };

    // --- DOM Rendering ---

    const renderHeader = () => {
        const selectHeader = settings.selectable ? `<th><input type="checkbox" data-select-all aria-label="Select all rows"></th>` : '';
        const headerCells = settings.columns.map(col => {
            const sortIcon = col.filterableAndSortable ? `<span class="${settings.tableClass}-sort-icon" data-sort-column="${col.id}" aria-label="Sort by ${col.caption || col.id}"></span>` : '';
            const resizer = settings.resizable ? `<span class="${settings.tableClass}-resize-handle"></span>` : '';
            const style = state.columnWidths[col.id] ? `width: ${state.columnWidths[col.id]};` : '';

            return `<th style="${style}" data-column-id="${col.id}">
                <div class="${settings.tableClass}-header-content">
                    <span>${sanitize(col.caption || col.id)}</span>
                    ${sortIcon}
                </div>
                ${resizer}
            </th>`;
        }).join('');

        const filterCells = settings.filtering.enabled ? settings.columns.map(col => {
            const input = col.filterableAndSortable ? `<input type="search" placeholder="Filter..." data-filter-column="${col.id}" aria-label="Filter ${col.caption || col.id}"/>` : '';
            return `<th>${input}</th>`;
        }).join('') : '';

        const selectFilter = settings.filtering.enabled && settings.selectable ? '<th></th>' : '';
        const filterRow = settings.filtering.enabled ? `<tr class="${settings.tableClass}-filter-row">${selectFilter}${filterCells}</tr>` : '';

        return `<thead><tr>${selectHeader}${headerCells}</tr>${filterRow}</thead>`;
    };

    const renderBody = () => {
        if (state.data.length === 0) {
            const colSpan = settings.columns.length + (settings.selectable ? 1 : 0);
            return `<tbody><tr><td colspan="${colSpan}" class="${settings.tableClass}-empty">${settings.emptyMessage}</td></tr></tbody>`;
        }

        const bodyHtml = state.data.map(row => {
            const rowId = row[settings.keyField];
            const isSelected = state.selectedRows.has(rowId);
            const selectCell = settings.selectable ? `<td><input type="checkbox" data-row-id="${sanitize(rowId)}" ${isSelected ? 'checked' : ''}></td>` : '';
            const cells = settings.columns.map(col => {
                const value = row[col.id];
                const content = col.render ? col.render(row) : (value ?? '–');
                return `<td>${sanitize(content)}</td>`;
            }).join('');
            return `<tr data-row-key="${sanitize(rowId)}" class="${isSelected ? 'selected' : ''}">${selectCell}${cells}</tr>`;
        }).join('');

        return `<tbody>${bodyHtml}</tbody>`;
    };

    const renderPagination = () => {
        if (!settings.pagination.enabled || state.totalPages <= 1) return '';

        const startRow = state.totalCount > 0 ? (state.currentPage - 1) * settings.pagination.pageSize + 1 : 0;
        const endRow = Math.min(state.currentPage * settings.pagination.pageSize, state.totalCount);
        const info = `<span class="info">${settings.locale.showing} ${startRow}-${endRow} ${settings.locale.of} ${state.totalCount}</span>`;
        
        let pageButtons = '';
        const MAX_PAGES_SHOWN = 7;
        if (state.totalPages <= MAX_PAGES_SHOWN) {
            pageButtons = Array.from({ length: state.totalPages }, (_, i) => i + 1)
                .map(p => `<button data-page="${p}" ${p === state.currentPage ? 'class="active"' : ''}>${p}</button>`).join('');
        } else {
            const pages = new Set([1, state.totalPages, state.currentPage, state.currentPage - 1, state.currentPage + 1]);
            const sortedPages = Array.from(pages).filter(p => p > 0 && p <= state.totalPages).sort((a,b) => a - b);
            
            let lastPage = 0;
            for (const p of sortedPages) {
                if (p > lastPage + 1) pageButtons += `<span>...</span>`;
                pageButtons += `<button data-page="${p}" ${p === state.currentPage ? 'class="active"' : ''}>${p}</button>`;
                lastPage = p;
            }
        }

        return `
            ${info}
            <div class="controls">
                <button data-page="prev" ${state.currentPage === 1 ? 'disabled' : ''}>${settings.locale.prev}</button>
                ${pageButtons}
                <button data-page="next" ${state.currentPage >= state.totalPages ? 'disabled' : ''}>${settings.locale.next}</button>
            </div>
        `;
    };

    const update = () => {
        logger.log("Updating table content...");
        if (elements.table) {
            elements.table.innerHTML = renderHeader() + renderBody();
            elements.tbody = elements.table.querySelector('tbody');
        }
        if (elements.pagination) {
            elements.pagination.innerHTML = renderPagination();
        }

        if (state.sorter) {
            const icon = container.querySelector(`[data-sort-column="${state.sorter.column}"]`);
            if (icon) icon.classList.add(`sort-${state.sorter.order}`);
        }
    };

    // --- Event Handlers ---

    const attachEventListeners = () => {
        elements.wrapper.addEventListener('click', async (e) => {
            const sortIcon = e.target.closest(`[data-sort-column]`);
            if (sortIcon) {
                const columnId = sortIcon.dataset.sortColumn;
                const newOrder = state.sorter?.column === columnId && state.sorter.order === 'asc' ? 'desc' : 'asc';
                state.sorter = { column: columnId, order: newOrder };
                state.currentPage = 1;
                await refresh();
                return;
            }

            const pageButton = e.target.closest('[data-page]');
            if (pageButton && !pageButton.disabled) {
                let newPage = pageButton.dataset.page;
                if (newPage === 'prev') newPage = state.currentPage - 1;
                else if (newPage === 'next') newPage = state.currentPage + 1;
                else newPage = parseInt(newPage, 10);
                if (newPage !== state.currentPage) {
                    state.currentPage = newPage;
                    await refresh();
                }
                return;
            }

            if (settings.selectable) {
                if (e.target.closest('[data-select-all]')) handleSelectAll(e.target.checked);
                if (e.target.closest('input[type="checkbox"][data-row-id]')) handleSelectRow(e.target.dataset.rowId, e.target.checked);
            }
        });

        elements.wrapper.addEventListener('input', debounce(async (e) => {
            if (e.target.matches('[data-filter-column]')) {
                state.filters[e.target.dataset.filterColumn] = e.target.value;
                state.currentPage = 1;
                await refresh();
            }
        }, settings.filtering.debounceMs));

        if (settings.resizable) {
            let resizingState = {};
            elements.wrapper.addEventListener('mousedown', (e) => {
                if (!e.target.matches(`.${settings.tableClass}-resize-handle`)) return;
                e.preventDefault();
                const th = e.target.closest('th');
                resizingState = { th, columnId: th.dataset.columnId, startX: e.pageX, startWidth: th.offsetWidth };
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp, { once: true });
            });
            const onMouseMove = (e) => {
                const newWidth = resizingState.startWidth + (e.pageX - resizingState.startX);
                if (newWidth > 50) resizingState.th.style.width = `${newWidth}px`;
            };
            const onMouseUp = () => {
                state.columnWidths[resizingState.columnId] = resizingState.th.style.width;
                document.removeEventListener('mousemove', onMouseMove);
            };
        }
    };

    const handleSelectAll = (checked) => {
        if (checked) state.data.forEach(row => state.selectedRows.add(row[settings.keyField]));
        else state.data.forEach(row => state.selectedRows.delete(row[settings.keyField]));
        update();
    };

    const handleSelectRow = (rowId, checked) => {
        if (checked) state.selectedRows.add(rowId);
        else state.selectedRows.delete(rowId);

        elements.tbody.querySelector(`tr[data-row-key="${rowId}"]`)?.classList.toggle('selected', checked);
        
        const selectAllCheckbox = container.querySelector('[data-select-all]');
        if (selectAllCheckbox) {
            const allOnPageSelected = state.data.length > 0 && state.data.every(row => state.selectedRows.has(row[settings.keyField]));
            selectAllCheckbox.checked = allOnPageSelected;
            selectAllCheckbox.indeterminate = !allOnPageSelected && Array.from(state.selectedRows).some(selId => state.data.find(r => r[settings.keyField] === selId));
        }
    };

    // --- Initialization and Styles ---

    const injectStyles = () => {
        const styleId = `dynamic-table-styles-${containerId}`;
        if (document.getElementById(styleId)) return;
        let css = `
            :root {
                --dt-border-color: #e0e0e0; --dt-header-bg: #f5f5f5; --dt-hover-bg: #f0f0f0;
                --dt-stripe-bg: #f9f9f9; --dt-selected-bg: #e7f3ff; --dt-primary-color: #007bff;
            }
            .${settings.tableClass}-wrapper { position: relative; }
            .${settings.tableClass}-scroll-container { overflow-x: auto; }
            .${settings.tableClass} { width: 100%; border-collapse: collapse; text-align: left; }
            .${settings.tableClass} th, .${settings.tableClass} td { padding: 0.75em; border-bottom: 1px solid var(--dt-border-color); vertical-align: middle; white-space: nowrap; }
            .${settings.tableClass} th { font-weight: 600; background: var(--dt-header-bg); position: relative; }
            .${settings.tableClass}-header-content { display: flex; align-items: center; justify-content: space-between; gap: 0.5em; }
            .${settings.tableClass} tbody tr:hover { background-color: var(--dt-hover-bg); }
            .${settings.tableClass} tbody tr.selected { background-color: var(--dt-selected-bg); }
            .${settings.tableClass}-sort-icon { cursor: pointer; user-select: none; width: 1em; height: 1em; text-align: center; color: #aaa; }
            .${settings.tableClass}-sort-icon::before { content: '▲▼'; opacity: 0.3; }
            .${settings.tableClass}-sort-icon.sort-asc::before { content: '▲'; opacity: 1; }
            .${settings.tableClass}-sort-icon.sort-desc::before { content: '▼'; opacity: 1; }
            .${settings.tableClass}-sort-icon.sort-asc, .${settings.tableClass}-sort-icon.sort-desc { color: #333; }
            .${settings.tableClass}-filter-row input { width: 100%; box-sizing: border-box; padding: 0.5em; border: 1px solid #ccc; border-radius: 4px; font-size: 0.9em;}
            .${settings.tableClass}-empty { text-align: center; color: #666; padding: 2em; }
            .${settings.tableClass}-pagination { display: flex; justify-content: space-between; align-items: center; margin-top: 1.5em; flex-wrap: wrap; gap: 1em; }
            .${settings.tableClass}-pagination .controls { display: flex; align-items: center; gap: 0.25em; }
            .${settings.tableClass}-pagination .controls span { margin: 0 0.5em; }
            .${settings.tableClass}-pagination button { border: 1px solid #ccc; background: #fff; padding: 0.5em 0.75em; border-radius: 4px; cursor: pointer; }
            .${settings.tableClass}-pagination button:hover:not(:disabled) { background-color: #f0f0f0; }
            .${settings.tableClass}-pagination button:disabled:not(.active) { cursor: not-allowed; opacity: 0.5; }
            .${settings.tableClass}-pagination button.active { background: var(--dt-primary-color); color: white; border-color: var(--dt-primary-color); }
            .${settings.tableClass}-resize-handle { position: absolute; top: 0; right: 0; width: 5px; height: 100%; cursor: col-resize; user-select: none; }
        `;
        if (settings.bordered) css += `
            .${settings.tableClass}-scroll-container { border: 1px solid var(--dt-border-color); border-radius: 4px; }
            .${settings.tableClass} th, .${settings.tableClass} td { border-right: 1px solid var(--dt-border-color); }
            .${settings.tableClass} th:last-child, .${settings.tableClass} td:last-child { border-right: none; }`;
        if (settings.striped) css += `.${settings.tableClass} tbody tr:nth-child(even) { background-color: var(--dt-stripe-bg); }`;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = css;
        document.head.appendChild(style);
    };

    const initialRender = () => {
        logger.log("Performing initial render...");
        container.innerHTML = `
            <div class="${settings.tableClass}-wrapper">
                <div class="${settings.tableClass}-scroll-container">
                    <table class="${settings.tableClass}" role="grid"></table>
                </div>
                <div class="${settings.tableClass}-pagination"></div>
            </div>`;
        elements.wrapper = container.querySelector(`.${settings.tableClass}-wrapper`);
        elements.table = container.querySelector('table');
        elements.pagination = container.querySelector(`.${settings.tableClass}-pagination`);
        injectStyles();
        attachEventListeners();
    };

    // --- Public API and Execution ---

    const refresh = async () => {
        await fetchData();
        update();
    };

    const updateData = async (newData) => {
        if (settings.serverSide) {
            logger.warn('updateData is not intended for serverSide mode. Please use refresh().');
            return;
        }
        settings.data = Array.isArray(newData) ? newData : [];
        state.currentPage = 1;
        state.selectedRows.clear();
        await refresh();
    };

    logger.log("Initializing table...");
    initialRender();
    refresh();

    return { refresh, updateData, getState: () => state, };
}