import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule, themeQuartz } from 'ag-grid-community';
import { displayValue, diffRows, rowIdOf } from './rows.js';

ModuleRegistry.registerModules([AllCommunityModule]);

/* The spreadsheet. AG Grid Community (MIT) does the sorting, the per-column
 * filters, the frozen header and first column, resizing, reordering, and the
 * virtual scrolling that keeps ten thousand rows smooth.
 *
 * The data is read-only. Rows are not edited here, and there are no formulas:
 * researchers analyse in Excel or R after exporting.
 *
 * New rows arrive without the grid being rebuilt. When the rows change, only the
 * difference is applied, so a researcher's sort, filters, column choices and scroll
 * position stay put while the data moves, and the rows that arrived flash. */

const parseDay = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const parseTime = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };

function columnDefs(sheet) {
  return sheet.columns.map((c) => {
    const def = {
      colId: c.field,
      headerName: c.header,
      width: c.width,
      pinned: c.pinned ? 'left' : undefined,
      lockPinned: Boolean(c.pinned),
      valueFormatter: (p) => displayValue(p.value, c.type),
    };
    if (c.type === 'number') {
      def.valueGetter = (p) => (p.data[c.field] === null || p.data[c.field] === undefined ? null : Number(p.data[c.field]));
      def.filter = 'agNumberColumnFilter';
      def.type = 'numericColumn';
    } else if (c.type === 'date' || c.type === 'datetime') {
      def.valueGetter = (p) => p.data[c.field] ?? null;
      def.filter = 'agDateColumnFilter';
      def.filterValueGetter = (p) => (c.type === 'date' ? parseDay(p.data[c.field]) : parseTime(p.data[c.field]));
      def.filterParams = { comparator: (filterDate, cell) => {
        if (!cell) return -1;
        const a = new Date(cell.getFullYear(), cell.getMonth(), cell.getDate()).getTime();
        const b = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate()).getTime();
        return a === b ? 0 : a < b ? -1 : 1;
      } };
    } else if (c.type === 'bool') {
      def.valueGetter = (p) => p.data[c.field] ?? null;
      def.filter = 'agTextColumnFilter';
      def.filterValueGetter = (p) => (p.data[c.field] === null || p.data[c.field] === undefined ? '' : p.data[c.field] ? 'Yes' : 'No');
    } else {
      def.valueGetter = (p) => p.data[c.field] ?? null;
      def.filter = 'agTextColumnFilter';
    }
    return def;
  });
}

const Grid = forwardRef(function Grid({ sheet, rows, quickFilter, onCounts }, ref) {
  const api = useRef(null);
  const held = useRef(null);            // the rows the grid currently holds
  const defs = useMemo(() => columnDefs(sheet), [sheet]);
  const getRowId = useMemo(() => { const id = rowIdOf(sheet); return (p) => id(p.data); }, [sheet]);

  const counts = () => {
    if (!api.current) return;
    let shown = 0; api.current.forEachNodeAfterFilterAndSort(() => { shown += 1; });
    onCounts?.({ shown, total: held.current?.length ?? 0, filtered: api.current.isAnyFilterPresent() || Boolean(quickFilter) });
  };

  useImperativeHandle(ref, () => ({
    /* The rows as they are on screen: filtered, sorted, in column order. */
    displayedRows() {
      const out = [];
      api.current?.forEachNodeAfterFilterAndSort((n) => out.push(n.data));
      return out;
    },
    isFiltered: () => Boolean(api.current?.isAnyFilterPresent()),
    visibleColumns: () => (api.current?.getAllDisplayedColumns() ?? []).map((c) => c.getColId()),
    setColumnVisible: (field, visible) => api.current?.setColumnsVisible([field], visible),
    clearFilters: () => { api.current?.setFilterModel(null); },
  }), []);

  // The first rows are set in one go. After that, only what changed is applied.
  useEffect(() => {
    if (!api.current || !rows) return;
    if (held.current === null) {
      api.current.setGridOption('rowData', rows);
      held.current = rows;
      counts();
      return;
    }
    const d = diffRows(sheet, held.current, rows);
    held.current = rows;
    if (!d.add.length && !d.update.length && !d.remove.length) return;
    const res = api.current.applyTransaction(d);
    const touched = [...(res?.add ?? []), ...(res?.update ?? [])];
    if (touched.length && touched.length < 500) api.current.flashCells({ rowNodes: touched, flashDuration: 1500, fadeDuration: 1500 });
    counts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sheet]);

  useEffect(() => {
    api.current?.setGridOption('quickFilterText', quickFilter ?? '');
    counts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickFilter]);

  return (
    <div className="rs-grid">
      <AgGridReact
        theme={themeQuartz}
        columnDefs={defs}
        defaultColDef={{ sortable: true, resizable: true, filter: true, suppressHeaderMenuButton: false }}
        getRowId={getRowId}
        animateRows={false}
        enableCellTextSelection
        ensureDomOrder
        suppressMovableColumns={false}
        // Search looks in every column, including ones hidden from view, so hiding a
        // column to tidy the screen never changes what a search finds.
        includeHiddenColumnsInQuickFilter
        rowHeight={34}
        headerHeight={38}
        onGridReady={(e) => { api.current = e.api; held.current = null; if (rows) { e.api.setGridOption('rowData', rows); held.current = rows; counts(); } }}
        onFilterChanged={counts}
        onSortChanged={counts}
      />
    </div>
  );
});

export default Grid;
