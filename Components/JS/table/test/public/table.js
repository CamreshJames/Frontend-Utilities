/**
 * Creates a dynamic, interactive data table within a specified container.
 * @param {string} containerId The ID of the HTML element where the table will be rendered.
 * @param {Object} config The configuration object for the table.
 * @param {Array} config.data The array of data objects to display.
 * @param {Array} config.columns An array of column definition objects.
 * @param {string} [config.keyField] The unique identifier property in your data. Required for row selection.
 * @returns {Object} An API to interact with the table instance.
 */
export function createDynamicTable(containerId, config) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`[DynamicTable] Error: Container #${containerId} not found.`);
        return {};
    }

    // --- Configuration & State ---

    const settings = {
        data: [],
        columns: [],
        keyField: null,
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
        locale: { prev: "Previous", next: "Next", showing: "Showing", of: "of" },
        ...config,
        pagination: { enabled: false, pageSize: 10, ...config.pagination },
        filtering: { enabled: false, debounceMs: 300, ...config.filtering },
        locale: { prev: "Previous", next: "Next", showing: "Showing", of: "of", ...config.locale },
    };

    if (settings.selectable && !settings.keyField) {
        console.error(`[DynamicTable] 'keyField' must be configured when 'selectable' is true.`);
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

    const elements = { wrapper: null, table: null, thead: null, tbody: null, pagination: null };
    const logger = {
        log: (...args) => settings.logging && console.log(`[DynamicTable:${containerId}]`, ...args),
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
                const comparison = String(valA ?? '').localeCompare(String(valB ?? ''), undefined, { numeric: true });
                return order === 'asc' ? comparison : -comparison;
            });
        }

        state.totalCount = processedData.length;
        state.totalPages = settings.pagination.enabled ? Math.ceil(state.totalCount / settings.pagination.pageSize) : 1;
        state.currentPage = Math.max(1, Math.min(state.currentPage, state.totalPages));

        const start = (state.currentPage - 1) * settings.pagination.pageSize;
        state.data = settings.pagination.enabled ? processedData.slice(start, start + settings.pagination.pageSize) : processedData;
    };

    // --- DOM Rendering ---

    const renderHeader = () => {
        const selectHeader = settings.selectable ? `<th><input type="checkbox" data-select-all aria-label="Select all rows"></th>` : '';
        const headerCells = settings.columns.map(col => {
            const sortIcon = col.filterableAndSortable ? `<span class="${settings.tableClass}-sort-icon" data-sort-column="${col.id}"></span>` : '';
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

        const selectFilter = settings.filtering.enabled && settings.selectable ? '<th></th>' : '';
        const filterCells = settings.filtering.enabled ? settings.columns.map(col => {
            const input = col.filterableAndSortable ? `<input type="search" placeholder="Filter..." data-filter-column="${col.id}"/>` : '';
            return `<th>${input}</th>`;
        }).join('') : '';
        const filterRow = settings.filtering.enabled ? `<tr class="${settings.tableClass}-filter-row">${selectFilter}${filterCells}</tr>` : '';

        return `<thead><tr>${selectHeader}${headerCells}</tr>${filterRow}</thead>`;
    };

    const renderBody = () => {
        if (state.data.length === 0) {
            const colSpan = settings.columns.length + (settings.selectable ? 1 : 0);
            return `<tr><td colspan="${colSpan}" class="${settings.tableClass}-empty">${settings.emptyMessage}</td></tr>`;
        }
        return state.data.map(row => {
            const rowId = row[settings.keyField];
            const isSelected = state.selectedRows.has(rowId);
            const selectCell = settings.selectable ? `<td><input type="checkbox" data-row-id="${sanitize(rowId)}" ${isSelected ? 'checked' : ''}></td>` : '';
            const cells = settings.columns.map(col => {
                const value = row[col.id];
                let content;
                if (col.isImage && value) {
                    content = `<img class="${settings.tableClass}-cell-image" src="${sanitize(value)}" alt="${sanitize(col.caption || '')}" />`;
                } else if (col.render) {
                    content = col.render(row);
                } else {
                    content = sanitize(value ?? '–');
                }
                return `<td>${content}</td>`;
            }).join('');
            return `<tr data-row-key="${sanitize(rowId)}" class="${isSelected ? 'selected' : ''}">${selectCell}${cells}</tr>`;
        }).join('');
    };

    const renderPagination = () => {
        if (!settings.pagination.enabled || state.totalPages <= 1) return '';
        const { prev, next, showing, of } = settings.locale;
        const startRow = state.totalCount > 0 ? (state.currentPage - 1) * settings.pagination.pageSize + 1 : 0;
        const endRow = Math.min(state.currentPage * settings.pagination.pageSize, state.totalCount);

        let pageButtons = '';
        const pages = new Set([1, state.totalPages, state.currentPage, state.currentPage - 1, state.currentPage + 1]);
        const sortedPages = Array.from(pages).filter(p => p > 0 && p <= state.totalPages).sort((a, b) => a - b);
        let lastPage = 0;
        for (const p of sortedPages) {
            if (p > lastPage + 1) pageButtons += `<span>...</span>`;
            pageButtons += `<button data-page="${p}" ${p === state.currentPage ? 'class="active"' : ''}>${p}</button>`;
            lastPage = p;
        }

        return `
            <span class="info">${showing} ${startRow}-${endRow} ${of} ${state.totalCount}</span>
            <div class="controls">
                <button data-page="prev" ${state.currentPage === 1 ? 'disabled' : ''}>${prev}</button>
                ${pageButtons}
                <button data-page="next" ${state.currentPage >= state.totalPages ? 'disabled' : ''}>${next}</button>
            </div>`;
    };

    const update = () => {
        logger.log("Updating table content...");
        if (elements.tbody) elements.tbody.innerHTML = renderBody();
        if (elements.pagination) elements.pagination.innerHTML = renderPagination();

        elements.thead?.querySelectorAll(`.${settings.tableClass}-sort-icon`).forEach(icon => {
            icon.classList.remove('sort-asc', 'sort-desc');
        });
        if (state.sorter) {
            const icon = elements.thead?.querySelector(`[data-sort-column="${state.sorter.column}"]`);
            if (icon) icon.classList.add(`sort-${state.sorter.order}`);
        }
    };

    // --- Event Handlers ---

    const attachEventListeners = () => {
        elements.wrapper.addEventListener('click', async (e) => {
            const target = e.target;
            const sortIcon = target.closest(`[data-sort-column]`);
            if (sortIcon) {
                const columnId = sortIcon.dataset.sortColumn;
                state.sorter = {
                    column: columnId,
                    order: state.sorter?.column === columnId && state.sorter.order === 'asc' ? 'desc' : 'asc'
                };
                state.currentPage = 1;
                return refresh();
            }

            const pageButton = target.closest('[data-page]');
            if (pageButton && !pageButton.disabled) {
                let newPage = pageButton.dataset.page;
                if (newPage === 'prev') newPage = state.currentPage - 1;
                else if (newPage === 'next') newPage = state.currentPage + 1;
                else newPage = parseInt(newPage, 10);
                if (newPage !== state.currentPage) {
                    state.currentPage = newPage;
                    return refresh();
                }
            }

            if (settings.selectable) {
                if (target.closest('[data-select-all]')) handleSelectAll(target.checked);
                if (target.closest('input[type="checkbox"][data-row-id]')) handleSelectRow(target.dataset.rowId, target.checked);
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
            const onMouseMove = (e) => {
                const newWidth = resizingState.startWidth + (e.pageX - resizingState.startX);
                if (newWidth > 50) resizingState.th.style.width = `${newWidth}px`;
            };
            const onMouseUp = () => {
                state.columnWidths[resizingState.columnId] = resizingState.th.style.width;
                document.removeEventListener('mousemove', onMouseMove);
            };
            elements.wrapper.addEventListener('mousedown', (e) => {
                if (!e.target.matches(`.${settings.tableClass}-resize-handle`)) return;
                e.preventDefault();
                const th = e.target.closest('th');
                resizingState = { th, columnId: th.dataset.columnId, startX: e.pageX, startWidth: th.offsetWidth };
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp, { once: true });
            });
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

        const selectAllCheckbox = elements.thead.querySelector('[data-select-all]');
        if (selectAllCheckbox) {
            const allOnPageSelected = state.data.length > 0 && state.data.every(row => state.selectedRows.has(row[settings.keyField]));
            selectAllCheckbox.checked = allOnPageSelected;
            selectAllCheckbox.indeterminate = !allOnPageSelected && Array.from(state.selectedRows).some(selId => state.data.find(r => r[settings.keyField] === selId));
        }
    };

    // --- Initialization & Styles ---

    const injectStyles = () => {
        const styleId = `dynamic-table-styles-${containerId}`;
        if (document.getElementById(styleId)) return;
        let css = `
            :root { --dt-border-color: #e0e0e0; --dt-header-bg: #f5f5f5; --dt-hover-bg: #f0f0f0; --dt-stripe-bg: #f9f9f9; --dt-selected-bg: #e7f3ff; --dt-primary-color: #007bff; }
            .${settings.tableClass}-wrapper { position: relative; }
            .${settings.tableClass}-scroll-container { overflow-x: auto; }
            .${settings.tableClass} { width: 100%; border-collapse: collapse; text-align: left; }
            .${settings.tableClass} th, .${settings.tableClass} td { padding: 0.75em; border-bottom: 1px solid var(--dt-border-color); vertical-align: middle; white-space: nowrap; }
            .${settings.tableClass} th { font-weight: 600; background: var(--dt-header-bg); position: relative; user-select: none; }
            .${settings.tableClass}-header-content { display: flex; align-items: center; justify-content: space-between; gap: 0.5em; }
            .${settings.tableClass} tbody tr:hover { background-color: var(--dt-hover-bg); }
            .${settings.tableClass} tbody tr.selected { background-color: var(--dt-selected-bg); }
            .${settings.tableClass}-sort-icon { cursor: pointer; width: 1em; height: 1em; text-align: center; color: #aaa; }
            .${settings.tableClass}-sort-icon::before { content: '▲▼'; opacity: 0.3; }
            .${settings.tableClass}-sort-icon.sort-asc::before { content: '▲'; opacity: 1; color: #333; }
            .${settings.tableClass}-sort-icon.sort-desc::before { content: '▼'; opacity: 1; color: #333; }
            .${settings.tableClass}-filter-row input { width: 100%; box-sizing: border-box; padding: 0.5em; border: 1px solid #ccc; border-radius: 4px; font-size: 0.9em;}
            .${settings.tableClass}-empty { text-align: center; color: #666; padding: 2em; }
            .${settings.tableClass}-pagination { display: flex; justify-content: space-between; align-items: center; margin-top: 1.5em; flex-wrap: wrap; gap: 1em; }
            .${settings.tableClass}-pagination .controls { display: flex; align-items: center; gap: 0.25em; }
            .${settings.tableClass}-pagination .controls span { margin: 0 0.5em; }
            .${settings.tableClass}-pagination button { border: 1px solid #ccc; background: #fff; padding: 0.5em 0.75em; border-radius: 4px; cursor: pointer; }
            .${settings.tableClass}-pagination button:hover:not(:disabled) { background-color: #f0f0f0; }
            .${settings.tableClass}-pagination button:disabled:not(.active) { cursor: not-allowed; opacity: 0.5; }
            .${settings.tableClass}-pagination button.active { background: var(--dt-primary-color); color: white; border-color: var(--dt-primary-color); }
            .${settings.tableClass}-resize-handle { position: absolute; top: 0; right: 0; width: 5px; height: 100%; cursor: col-resize; }
            .${settings.tableClass}-cell-image { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid var(--dt-border-color); }
        `;
        if (settings.bordered) css += `.${settings.tableClass}-scroll-container { border: 1px solid var(--dt-border-color); border-radius: 4px; } .${settings.tableClass} th, .${settings.tableClass} td { border-right: 1px solid var(--dt-border-color); } .${settings.tableClass} th:last-child, .${settings.tableClass} td:last-child { border-right: none; }`;
        if (settings.striped) css += `.${settings.tableClass} tbody tr:nth-child(even):not(.selected) { background-color: var(--dt-stripe-bg); }`;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = css;
        document.head.appendChild(style);
    };

    const initialRender = () => {
        container.innerHTML = `
            <div class="${settings.tableClass}-wrapper">
                <div class="${settings.tableClass}-scroll-container">
                    <table class="${settings.tableClass}" role="grid">
                        ${renderHeader()}
                        <tbody></tbody>
                    </table>
                </div>
                <div class="${settings.tableClass}-pagination"></div>
            </div>`;
        elements.wrapper = container.querySelector(`.${settings.tableClass}-wrapper`);
        elements.table = container.querySelector('table');
        elements.thead = elements.table.querySelector('thead');
        elements.tbody = elements.table.querySelector('tbody');
        elements.pagination = container.querySelector(`.${settings.tableClass}-pagination`);
        injectStyles();
        attachEventListeners();
    };

    // --- Public API & Execution ---

    const refresh = async () => {
        if (!settings.serverSide) processClientData();
        update();
    };

    const updateData = async (newData) => {
        if (settings.serverSide) return;
        settings.data = Array.isArray(newData) ? newData : [];
        state.currentPage = 1;
        state.selectedRows.clear();
        await refresh();
    };

    logger.log("Initializing table...");
    initialRender();
    refresh();

    return { refresh, updateData, getState: () => ({ ...state }) };
}